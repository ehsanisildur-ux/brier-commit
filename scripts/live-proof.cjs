const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {root,assert,equal,digest,sourceHash,save,invoke,read,rpc,receipt,delay}=require('./transport.cjs');
const {question,commitment,checkState}=require('./proof-checks.cjs');
const publisher='ehsanisildur-ux/brier-commit',names=['yes','no','conflict'];
async function main(){
 assert(await rpc('eth_chainId',[])==='0xf22f','Gasless StudioNet only');
 const accounts=JSON.parse(process.env.BRIER_ACCOUNTS||'null');assert(accounts?.length===3,'Two forecasters and outsider');
 const revision=fs.readFileSync(path.join(root,'config/fixture-revision.txt'),'utf8').trim();assert(/^[a-f0-9]{40}$/.test(revision),'Pinned fixtures');
 const deployments=[];
 for(const name of names){
  const fixtures=[];
  for(const side of ['a','b']){
   const body=fs.readFileSync(path.join(root,'reports',`${name}-${side}.md`)),url=`https://raw.githubusercontent.com/${publisher}/${revision}/reports/${name}-${side}.md`;
   const r=await fetch(url,{signal:AbortSignal.timeout(45000)});assert(r.ok&&body.equals(Buffer.from(await r.arrayBuffer())),'Published report bytes');
   fixtures.push({url,sha256:digest(body),text:body.toString('utf8')});
  }
  const start=Date.now(),utc=ms=>new Date(ms).toISOString().replace(/\.\d{3}Z$/,'Z'),commitDate=utc(start+3600000),revealDate=utc(start+7200000);
  const forecasters=accounts.slice(0,2).map(a=>a.address);
  process.env.BRIER_ACCOUNT=accounts[0].name;
  const hash=await invoke(name+'-deployment',['deploy','--contract','contracts/brier_commit.py','--args',question,JSON.stringify(fixtures.map(f=>f.url)),JSON.stringify(forecasters),commitDate,revealDate]);
  const r=await receipt(name+'-deployment',hash,true),contract=r.to_address||r.recipient;
  assert(/^0x[a-f0-9]{40}$/i.test(contract),'Contract address');
  assert(fs.readFileSync(path.join(root,'contracts/brier_commit.py')).equals(Buffer.from(await rpc('gen_getContractCode',[contract]),'base64')),'Exact deployed code');
  const openings=[80,20].map(probability=>({probability,salt:crypto.randomBytes(32).toString('hex')}));
  // Keep salts in memory until their actual reveal transaction has executed.
  const d={name,contract,transaction:hash,question,forecasters,commit_until:Date.parse(commitDate)/1000,reveal_until:Date.parse(revealDate)/1000,fixture_revision:revision,fixtures,openings:[],source_sha256:sourceHash,network:'studionet',chain_id:61999};
  deployments.push(d);save('deployments',deployments);
  let state=await read(name+'-initial',['call',contract,'get_state']);
  assert(equal(state,{question,report_urls:fixtures.map(f=>f.url),commit_until:d.commit_until,reveal_until:d.reveal_until,attempts:0,settled:false,status:'COLLECTING',latest:null,forecasters:forecasters.map(address=>({address,commitment:'',probability:-1,score:-1}))}),'Empty forecast ledger');save(name+'-initial-state',state);
  async function step(label,method,args,account,success=true,reason=null){
   process.env.BRIER_ACCOUNT=accounts[account].name;
   const before=state,command=['write',contract,method,...(args.length?['--args',...args]:[])],tx=await invoke(label,command);
   const rr=await receipt(label,tx,success);state=await read(label+'-state',['call',contract,'get_state']);
   assert((rr.from_address||rr.sender).toLowerCase()===accounts[account].address,'Signing wallet');
   if(!success){
    assert(equal(before,state),'Rejected mutation changed state');
    const decoded=await read(label+'-decoded',['receipt',tx,'--status','FINALIZED','--retries','2']);
    assert(JSON.stringify(decoded).includes(reason),'Wrong rejection cause');save(label+'-decoded-receipt',decoded);
   }
   save(label,{contract,transaction:tx,sender:accounts[account].address,success,reason,method,args,state_before:before,state});
  }
  if(name==='yes')await step('unauthorized','commit',['f'.repeat(64)],2,false,'[EXPECTED] Forecaster not admitted');
  for(let i=0;i<2;i++){
   const o=openings[i],sealed=commitment(61999,contract,question,forecasters[i],o.probability,o.salt);
   await step(name+'-commit-'+i,'commit',[sealed],i);
   assert(state.forecasters[i].commitment===sealed&&state.forecasters.every(f=>f.probability===-1),'Sealed forecasts');
  }
  if(name==='yes')await step('bad-opening','reveal',['81',openings[0].salt],0,false,'[EXPECTED] Opening does not match commitment');
  for(let i=0;i<2;i++){
   const o=openings[i];await step(name+'-reveal-'+i,'reveal',[String(o.probability),o.salt],i);
   assert(state.forecasters[i].probability===o.probability&&state.forecasters[i].score===-1,'Unscored opening');
   d.openings.push(o);save('deployments',deployments);
  }
  await step(name+'-resolve','resolve',[],2);
  if(name==='conflict')await step('conflict-retry','resolve',[],2);
  checkState(state,d);save(name+'-final-state',state);
  if(name==='yes')await step('final-replay','resolve',[],2,false,'[EXPECTED] Forecasts already scored');
  console.log('VERIFIED',name,contract);await delay(4000);
 }
}
main().catch(e=>{console.error(e.stack,e.cause?.message||'');process.exitCode=1;});
