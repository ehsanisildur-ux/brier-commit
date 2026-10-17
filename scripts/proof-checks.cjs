const crypto=require('node:crypto');
const assert=(x,m)=>{if(!x)throw Error(m);};
const hash=body=>crypto.createHash('sha256').update(body).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const question='Did Aster complete one uninterrupted sealed-chamber run of at least 30 hours by 2026-09-30 23:59 UTC? Separate runs cannot be added; predictions, plans and other capsules do not qualify.';
const commitment=(chain,contract,q,address,p,salt)=>hash(JSON.stringify(['BrierCommit-v1',String(chain),contract.toLowerCase(),q,address.toLowerCase(),p,salt]));
const expected={yes:{labels:['YES','YES'],scores:[9600,3600],outcome:'YES'},no:{labels:['NO','NO'],scores:[3600,9600],outcome:'NO'},conflict:{labels:['YES','NO'],scores:[-1,-1],outcome:'UNRESOLVED'}};
function checkState(state,d){
 const want=expected[d.name];assert(want,'Known scenario');
 assert(state.question===question&&equal(state.report_urls,d.fixtures.map(f=>f.url)),'Fixed question and sources');
 assert(state.commit_until===d.commit_until&&state.reveal_until===d.reveal_until,'Immutable deadlines');
 assert(state.forecasters.length===2&&state.forecasters.every((r,i)=>r.address===d.forecasters[i]),'Roster');
 assert(state.settled===(d.name!=='conflict')&&state.status===(state.settled?'SCORED':'AWAITING_OUTCOME'),'Final status');
 assert(state.attempts===(d.name==='conflict'?2:1),'Attempt counter');
 assert(state.latest.outcome===want.outcome&&equal(state.latest.decisions.map(x=>x.outcome),want.labels),'Consequential outcomes');
 assert(state.latest.reports.length===2&&state.latest.decisions.length===2,'Two complete reports');
 for(let i=0;i<2;i++){
  const report=state.latest.reports[i],fixture=d.fixtures[i],row=state.forecasters[i],opening=d.openings[i];
  assert(report.url===fixture.url&&report.sha256===fixture.sha256&&report.text===fixture.text&&hash(report.text)===fixture.sha256,'Fetched raw snapshot');
  const paragraphs=report.text.replaceAll('\r\n','\n').split('\n\n').map(p=>p.trim()).filter(Boolean);
  assert(equal(report.paragraphs,paragraphs),'Paragraph normalization');
  const anchor=state.latest.decisions[i].paragraph;
  assert(Number.isInteger(anchor)&&anchor>=0&&anchor<paragraphs.length,'Material anchor index');
  assert(row.probability===opening.probability&&row.commitment===commitment(61999,d.contract,question,row.address,opening.probability,opening.salt),'Actual opening domain');
  assert(row.score===want.scores[i],'Exact expected score');
  if(state.settled){
   // Independent normalized-probability expansion of 1-(forecast-y)^2.
   // Every intermediate is integer after scaling to avoid JS decimal rounding.
   const y=want.outcome==='YES'?1:0,p=row.probability;
   const reward=10000-p*p+200*p*y-10000*y*y;
   assert(row.score===reward&&row.score>=0&&row.score<=10000,'Independent scoring equation');
  }
 }
}
module.exports={assert,hash,equal,question,commitment,expected,checkState};
