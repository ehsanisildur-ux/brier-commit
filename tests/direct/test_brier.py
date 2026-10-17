import ast
import hashlib
import itertools
import json
import re
import subprocess
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
QUESTION = 'Did Aster complete one uninterrupted sealed-chamber run of at least 30 hours by 2026-09-30 23:59 UTC? Separate runs cannot be added; predictions, plans and other capsules do not qualify.'
BASE = 'https://raw.githubusercontent.com/ehsanisildur-ux/brier-commit/' + 'a' * 40 + '/reports/'
DEADLINE = ('2026-10-17T01:00:00Z', '2026-10-17T02:00:00Z')
CASES = {'yes': [('YES', 1), ('YES', 2)], 'no': [('NO', 2), ('NO', 2)], 'conflict': [('YES', 1), ('NO', 1)]}
SALTS = ['a' * 64, 'b' * 64]


@pytest.fixture
def accounts(direct_alice, direct_bob):
    return [direct_alice, direct_bob]


@pytest.fixture
def contract(direct_deploy, direct_vm, accounts):
    direct_vm.warp('2026-10-17T00:00:00Z')
    return direct_deploy(str(ROOT / 'contracts/brier_commit.py'), QUESTION, [BASE+'yes-a.md', BASE+'yes-b.md'], accounts, *DEADLINE)


def digest(c, vm, address, probability, salt):
    from genlayer import gl
    body = ['BrierCommit-v1', str(int(gl.message.chain_id)), str(gl.message.contract_address).lower(), c.get_state()['question'],
            '0x'+address.hex(), probability, salt]
    return hashlib.sha256(json.dumps(body, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def seal(c, vm, accounts, probabilities=(80, 20)):
    for account, p, salt in zip(accounts, probabilities, SALTS):
        vm.sender = account
        c.commit(digest(c, vm, account, p, salt))


def open_all(c, vm, accounts, probabilities=(80, 20)):
    seal(c, vm, accounts, probabilities)
    for account, p, salt in zip(accounts, probabilities, SALTS):
        vm.sender = account
        c.reveal(p, salt)


def mock(vm, case='yes', decisions=None, audit=True, bodies=None, status=200):
    vm.clear_mocks()
    for index, side in enumerate(['a', 'b']):
        raw = (ROOT / ('reports/'+case+'-'+side+'.md')).read_bytes() if bodies is None else bodies[index]
        vm.mock_web(re.escape(BASE+'yes-'+side+'.md'), {'status': status, 'body': raw})
        label, anchor = CASES[case][index]
        response = decisions[index] if decisions is not None else {'outcome': label, 'paragraph': anchor}
        # Match the full report's distinguishing heading, not the leader result.
        heading = raw.decode('utf-8', errors='replace').split('\n')[0]
        vm.mock_llm('(?s).*BRIER-OUTCOME.*'+re.escape(heading)+'.*', json.dumps(response))
    vm.mock_llm('.*BRIER-ANCHOR.*', json.dumps({'valid': audit}))


@pytest.mark.parametrize('case,settled,outcome,scores', [('yes', True, 'YES', [9600,3600]), ('no',True,'NO',[3600,9600]), ('conflict',False,'UNRESOLVED',[-1,-1])])
def test_full_protocol(contract, direct_vm, accounts, case, settled, outcome, scores):
    open_all(contract, direct_vm, accounts)
    mock(direct_vm, case)
    contract.resolve()
    assert direct_vm.run_validator() is True
    state = contract.get_state()
    assert state['settled'] is settled and state['latest']['outcome'] == outcome and state['attempts'] == 1
    assert [r['score'] for r in state['forecasters']] == scores
    for report, side in zip(state['latest']['reports'], ['a','b']):
        raw = (ROOT/('reports/'+case+'-'+side+'.md')).read_bytes()
        assert report['text'] == raw.decode() and report['sha256'] == hashlib.sha256(raw).hexdigest()


def test_unresolved_retry_can_resolve_later_without_changing_forecasts(contract, direct_vm, accounts):
    open_all(contract, direct_vm, accounts)
    mock(direct_vm, 'conflict')
    contract.resolve()
    assert direct_vm.run_validator() is True
    previous = contract.get_state()
    mock(direct_vm, 'yes')
    contract.resolve()
    assert direct_vm.run_validator() is True
    current = contract.get_state()
    assert current['settled'] and current['attempts'] == 2
    assert [r['probability'] for r in current['forecasters']] == [r['probability'] for r in previous['forecasters']]
    assert [r['commitment'] for r in current['forecasters']] == [r['commitment'] for r in previous['forecasters']]


def test_no_early_reveal_and_no_replacement_commitment(contract, direct_vm, accounts):
    direct_vm.sender = accounts[0]
    contract.commit(digest(contract,direct_vm,accounts[0],80,SALTS[0]))
    with direct_vm.expect_revert('Commitments still open'):
        contract.reveal(80,SALTS[0])
    with direct_vm.expect_revert('Commitment immutable'):
        contract.commit('f'*64)


@pytest.mark.parametrize('p,salt', [(81,'a'*64),(80,'c'*64)])
def test_false_opening_preserves_commitment(contract,direct_vm,accounts,p,salt):
    seal(contract,direct_vm,accounts)
    direct_vm.sender=accounts[0]
    before=contract.get_state()
    with direct_vm.expect_revert('Opening does not match commitment'):
        contract.reveal(p,salt)
    assert contract.get_state()==before


@pytest.mark.parametrize('p,salt', [(True,'a'*64),(-1,'a'*64),(101,'a'*64),(80,'short')])
def test_reveal_type_bounds(contract,direct_vm,accounts,p,salt):
    seal(contract,direct_vm,accounts)
    direct_vm.sender=accounts[0]
    with direct_vm.expect_revert('Integer probability and 32-byte salt'):
        contract.reveal(p,salt)


def test_deadlines_prevent_nonreveal_deadlock(contract,direct_vm,accounts):
    direct_vm.sender=accounts[0]
    contract.commit(digest(contract,direct_vm,accounts[0],80,SALTS[0]))
    direct_vm.warp(DEADLINE[0])
    contract.reveal(80,SALTS[0])
    direct_vm.sender=accounts[1]
    with direct_vm.expect_revert('Commitment phase closed'):
        contract.commit('f'*64)
    direct_vm.warp(DEADLINE[1])
    with direct_vm.expect_revert('Reveal deadline passed'):
        contract.reveal(20,SALTS[1])
    mock(direct_vm)
    contract.resolve()
    assert direct_vm.run_validator() is True
    assert [r['score'] for r in contract.get_state()['forecasters']]==[9600,0]


def test_all_missing_forecasts_are_zero_after_deadline(contract,direct_vm):
    direct_vm.warp(DEADLINE[1])
    mock(direct_vm)
    contract.resolve()
    assert [r['score'] for r in contract.get_state()['forecasters']]==[0,0]


def test_early_resolution_blocked(contract,direct_vm,accounts):
    seal(contract,direct_vm,accounts)
    with direct_vm.expect_revert('Reveals still open'):
        contract.resolve()


@pytest.mark.parametrize('method',['commit','reveal'])
def test_outsider_cannot_submit_forecasts(contract,direct_vm,direct_charlie,method):
    direct_vm.sender=direct_charlie
    with direct_vm.expect_revert('Forecaster not admitted'):
        getattr(contract,method)(*(['f'*64] if method=='commit' else [80,SALTS[0]]))


def test_result_is_final(contract,direct_vm,accounts):
    open_all(contract,direct_vm,accounts)
    mock(direct_vm)
    contract.resolve()
    for method,args in [('resolve',[]),('commit',['f'*64]),('reveal',[80,SALTS[0]])]:
        with direct_vm.expect_revert('Forecasts already scored'):
            getattr(contract,method)(*args)


@pytest.mark.parametrize('decisions',[
    [{'outcome':'NO','paragraph':1},{'outcome':'YES','paragraph':2}],
    [{'outcome':'YES','paragraph':1},{'outcome':'UNRESOLVED','paragraph':-1}],
])
def test_validator_rejects_consequential_disagreement(contract,direct_vm,accounts,decisions):
    open_all(contract,direct_vm,accounts)
    mock(direct_vm)
    contract.resolve()
    mock(direct_vm,decisions=decisions)
    assert direct_vm.run_validator() is False


@pytest.mark.parametrize('audit',[False,'true',1,None])
def test_validator_requires_full_report_audit(contract,direct_vm,accounts,audit):
    open_all(contract,direct_vm,accounts)
    mock(direct_vm)
    contract.resolve()
    mock(direct_vm,audit=audit)
    assert direct_vm.run_validator() is False


def test_validator_refetches_exact_snapshot(contract,direct_vm,accounts):
    open_all(contract,direct_vm,accounts)
    mock(direct_vm)
    contract.resolve()
    raw=(ROOT/'reports/yes-a.md').read_bytes()+b'\nSnapshot changed.'
    mock(direct_vm,bodies=[raw,(ROOT/'reports/yes-b.md').read_bytes()])
    assert direct_vm.run_validator() is False


@pytest.mark.parametrize('decision', [{},{'outcome':'MAYBE','paragraph':0},{'outcome':'YES','paragraph':-1},{'outcome':'YES','paragraph':True},{'outcome':'NO','paragraph':999}])
def test_malformed_model_does_not_score(contract,direct_vm,accounts,decision):
    open_all(contract,direct_vm,accounts)
    mock(direct_vm,decisions=[decision,{'outcome':'YES','paragraph':2}])
    with direct_vm.expect_revert('LLM_ERROR'):
        contract.resolve()
    assert contract.get_state()['attempts']==0 and not contract.get_state()['settled']


def pure():
    tree=ast.parse((ROOT/'contracts/brier_commit.py').read_text())
    tree.body=[n for n in tree.body if not isinstance(n,ast.ClassDef) and not (isinstance(n,ast.ImportFrom) and n.module=='genlayer')]
    result={}
    exec(compile(tree,'<pure>','exec'),result)
    return result


def test_strict_propriety_over_all_10201_grid_pairs():
    scoring=pure()['score']
    for truth,forecast in itertools.product(range(101),repeat=2):
        honest=truth*scoring(truth,'YES')+(100-truth)*scoring(truth,'NO')
        proposed=truth*scoring(forecast,'YES')+(100-truth)*scoring(forecast,'NO')
        assert honest-proposed==100*(forecast-truth)**2
        assert (honest==proposed)==(truth==forecast)
    assert scoring(50,'YES')==scoring(50,'NO')==7500


def test_every_commitment_domain_field_matters():
    function=pure()['commitment']
    args=[61999,'0x'+'1'*40,QUESTION,'0x'+'2'*40,80,'a'*64]
    baseline=function(*args)
    for index,value in enumerate([4221,'0x'+'3'*40,QUESTION+' Changed.','0x'+'4'*40,20,'b'*64]):
        changed=list(args);changed[index]=value
        assert function(*changed)!=baseline


def test_js_client_and_contract_commitment_encoding_match():
    args=[61999,'0x'+'1'*40,QUESTION,'0x'+'2'*40,80,'a'*64]
    client=subprocess.check_output(['node','-e',"const m=require('./scripts/proof-checks.cjs'); process.stdout.write(m.commitment(...JSON.parse(process.argv[1])));",json.dumps(args)],cwd=ROOT,text=True)
    assert client==pure()['commitment'](*args)


@pytest.mark.parametrize('labels',[('YES','UNRESOLVED'),('UNRESOLVED','UNRESOLVED'),('UNRESOLVED','NO')])
def test_no_score_when_any_report_unresolved(contract,direct_vm,accounts,labels):
    open_all(contract,direct_vm,accounts)
    mock(direct_vm,decisions=[{'outcome':v,'paragraph':-1 if v=='UNRESOLVED' else (1 if i==0 else 2)} for i,v in enumerate(labels)])
    contract.resolve()
    assert direct_vm.run_validator() is True
    assert contract.get_state()['latest']['outcome']=='UNRESOLVED'
    assert [r['score'] for r in contract.get_state()['forecasters']]==[-1,-1]


def test_constructor_accepts_sdk_addresses(direct_deploy,direct_vm,accounts,monkeypatch):
    from gltest.direct import loader
    original=loader._allocate_contract
    def allocate(cls,vm,*args,**kwargs):
        from genlayer import Address
        values=list(args);values[2]=[Address(a) for a in values[2]]
        return original(cls,vm,*values,**kwargs)
    monkeypatch.setattr(loader,'_allocate_contract',allocate)
    direct_vm.warp('2026-10-17T00:00:00Z')
    c=direct_deploy(str(ROOT/'contracts/brier_commit.py'),QUESTION,[BASE+'yes-a.md',BASE+'yes-b.md'],accounts,*DEADLINE)
    assert [r['address'] for r in c.get_state()['forecasters']]==['0x'+a.hex() for a in accounts]


@pytest.mark.parametrize('case',['duplicate','zero','short','missing','extra'])
def test_invalid_roster(direct_deploy,direct_vm,accounts,case):
    roster=list(accounts)
    if case=='duplicate': roster[1]=roster[0]
    if case=='zero': roster[1]=bytes(20)
    if case=='short': roster[1]=b'no'
    if case=='missing': roster=roster[:1]
    if case=='extra': roster=roster*3
    direct_vm.warp('2026-10-17T00:00:00Z')
    with pytest.raises(Exception,match='forecasters required'):
        direct_deploy(str(ROOT/'contracts/brier_commit.py'),QUESTION,[BASE+'yes-a.md',BASE+'yes-b.md'],roster,*DEADLINE)


@pytest.mark.parametrize('dates',[('2026-10-16T23:59:00Z',DEADLINE[1]),(DEADLINE[1],DEADLINE[0]),('bad',DEADLINE[1])])
def test_constructor_deadlines(direct_deploy,direct_vm,accounts,dates):
    direct_vm.warp('2026-10-17T00:00:00Z')
    with pytest.raises(Exception,match='deadline|time'):
        direct_deploy(str(ROOT/'contracts/brier_commit.py'),QUESTION,[BASE+'yes-a.md',BASE+'yes-b.md'],accounts,*dates)
