const fs=require('node:fs'),path=require('node:path');
const {root,assert,equal,digest,rpc,read,receiptSummary,save}=require('./transport.cjs');
const {question,commitment,checkState}=require('./proof-checks.cjs');
const load=n=>JSON.parse(fs.readFileSync(path.join(root,'proofs',n+'.json')));
async function main(){
 const offline=process.argv.includes('--offline'),deployments=load('deployments'),code=fs.readFileSync(path.join(root,'contracts/brier_commit.py')),journal=load('transactions');
 assert(equal(deployments.map(d=>d.name),['yes','no','conflict']),'Complete cases');
 assert(journal.source_sha256===digest(code),'Journal/source');
 if(!offline)assert(await rpc('eth_chainId',[])==='0xf22f','StudioNet only');
 const hashes=new Set(),summary={mode:offline?'offline-artifact':'fresh-rpc-and-state',source_sha256:digest(code),contracts:[],transactions:[]};
 async function verify(label,hash,d,success,sender){
  assert(!hashes.has(hash)&&journal.hashes[label]===hash,'Unique journal-bound receipt');hashes.add(hash);
  const saved=load(label+'-receipt'),r=offline?saved:await rpc('eth_getTransactionByHash',[hash]),s=receiptSummary(r);
  assert(s.hash===hash&&s.status==='FINALIZED'&&s.result==='MAJORITY_AGREE'&&s.agree>(s.agree+s.disagree+s.idle)/2,'Finalized strict majority');
  assert((r.to_address||r.recipient).toLowerCase()===d.contract.toLowerCase()&&(r.from_address||r.sender).toLowerCase()===sender,'Destination/signer');
  assert(equal(r.consensus_data.votes,saved.consensus_data.votes),'Saved votes');
  assert(success?['SUCCESS','FINISHED_WITH_RETURN'].includes(s.execution):s.execution==='ERROR','Execution result');summary.transactions.push({label,...s});
 }
 for(const d of deployments){
  assert(d.network==='studionet'&&d.chain_id===61999&&d.source_sha256===digest(code)&&d.question===question,'Deployment domain');
  assert(d.fixture_revision===fs.readFileSync(path.join(root,'config/fixture-revision.txt'),'utf8').trim(),'Pinned fixtures');
  assert(new Set(d.forecasters).size===2,'Distinct forecasters');
  await verify(d.name+'-deployment',d.transaction,d,true,d.forecasters[0]);
  let previous=load(d.name+'-initial-state');
  assert(equal(previous,{question,report_urls:d.fixtures.map(f=>f.url),commit_until:d.commit_until,reveal_until:d.reveal_until,attempts:0,settled:false,status:'COLLECTING',latest:null,forecasters:d.forecasters.map(address=>({address,commitment:'',probability:-1,score:-1}))}),'Initial ledger');
  const labels=[...(d.name==='yes'?['unauthorized']:[]),d.name+'-commit-0',d.name+'-commit-1',...(d.name==='yes'?['bad-opening']:[]),d.name+'-reveal-0',d.name+'-reveal-1',d.name+'-resolve',...(d.name==='conflict'?['conflict-retry']:[]),...(d.name==='yes'?['final-replay']:[])];
  for(const label of labels){
   const p=load(label);assert(p.contract===d.contract&&equal(p.state_before,previous),'Proof chain');
   await verify(label,p.transaction,d,p.success,p.sender);
   if(!p.success){assert(equal(previous,p.state),'Rejected call changed state');assert(JSON.stringify(load(label+'-decoded-receipt')).includes(p.reason),'Error cause');}
   const match=label.match(/-(commit|reveal)-([01])$/);
   if(match){
    const i=Number(match[2]),opening=d.openings[i];assert(p.sender===d.forecasters[i]&&p.method===match[1],'Individual authorization');
    if(match[1]==='commit')assert(p.args[0]===commitment(61999,d.contract,question,p.sender,opening.probability,opening.salt)&&p.state.forecasters.every(f=>f.probability===-1),'Commitments before openings');
    else assert(p.args[0]===String(opening.probability)&&p.args[1]===opening.salt&&previous.forecasters.every(f=>f.commitment)&&p.state.forecasters[i].probability===opening.probability,'Valid opening after all commitments');
   }
   previous=p.state;
  }
  for(let i=0;i<2;i++){
   const side=i===0?'a':'b',body=fs.readFileSync(path.join(root,'reports',`${d.name}-${side}.md`)),f=d.fixtures[i];
   assert(f.url===`https://raw.githubusercontent.com/ehsanisildur-ux/brier-commit/${d.fixture_revision}/reports/${d.name}-${side}.md`&&f.sha256===digest(body)&&f.text===body.toString('utf8'),'Fixture commitment');
  }
  checkState(previous,d);assert(equal(previous,load(d.name+'-final-state')),'Final artifact');
  if(!offline){
   assert(code.equals(Buffer.from(await rpc('gen_getContractCode',[d.contract]),'base64')),'Exact live source');
   assert(equal(previous,await read(d.name+'-fresh',['call',d.contract,'get_state'])),'Fresh final state');
  }
  summary.contracts.push({name:d.name,contract:d.contract,status:previous.status,outcome:previous.latest.outcome,scores:previous.forecasters.map(f=>f.score)});
 }
 assert(hashes.size===22&&Object.keys(journal.hashes).length===22,'Complete twenty-two transaction set');
 if(!offline){summary.live_state_match=true;save('verification',summary);}
 console.log(JSON.stringify(summary,null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
