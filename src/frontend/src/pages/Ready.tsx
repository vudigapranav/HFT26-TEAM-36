import {useEffect,useRef,useState} from 'react';
import {Navigate,useNavigate} from 'react-router-dom';
import type {AssessmentState,Generation} from '../types';
import {failed,generating,neutral,POLL_MS,releasable,SOURCES,STAGES} from '../assessment';
import {api,Button,Chips,ErrorNotice,Icon,PageTitle,Steps,storedAssessment,useApp,type Problem} from '../lib';
import {preloadEditor} from '../editor-loader';

export default function Ready(){const {focus,user,setAssessment}=useApp(),navigate=useNavigate();
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[state,setState]=useState<AssessmentState|null>(null),[active,setActive]=useState(false);
 const poll=useRef<ReturnType<typeof setTimeout>|null>(null);
 const stored=storedAssessment(user?.user_id);
 useEffect(()=>()=>{if(poll.current)clearTimeout(poll.current)},[]);
 // Download the editor while the candidate reads this page and the questions are verified, not after.
 useEffect(()=>{preloadEditor()},[]);
 if(!focus)return <Navigate to="/portfolio" replace/>;
 // Follows the generation job every 2 s; questions are opened only after validation releases them (G3).
 function follow(next:AssessmentState){
  setState(next);setAssessment(next);
  if(failed(next)){setBusy(false);return;}
  if(releasable(next)){navigate('/workspace');return;}
  poll.current=setTimeout(()=>{api<AssessmentState>('GET',`/assessments/${next.assessment_id}/status`).then(follow).catch(e=>{
   if((e as Problem).code==='ASSESSMENT_GENERATING')follow(next);else{setError(e);setBusy(false);}
  })},POLL_MS);
 }
 async function start(){setBusy(true);setError(null);setActive(false);try{follow(await api<AssessmentState>('POST','/assessments',{}));}catch(e){
  // One active assessment per user (G4). The 409 carries no id, so resume needs the id this browser stored.
  if((e as Problem).code==='ASSESSMENT_ACTIVE'){setActive(true);}else setError(e);setBusy(false);}}
 async function resume(){if(!stored)return;setBusy(true);setError(null);try{const next=await api<AssessmentState>('GET',`/assessments/${stored.assessment_id}/status`);if(next.status!=='active'){setError(new Error('That assessment has finished. Open its report from Past reports.'));setBusy(false);return;}follow(next);}catch(e){setError(e);setBusy(false);}}
 const gen=state?.generation;
 return <section className="page ready-page"><Steps active={2}/><div className="ready-grid" style={{marginTop:40}}><div><PageTitle eyebrow="READY WHEN YOU ARE" description="One practical codebase. A chance to show how you think.">Your claims.<br/><em className="orange">Your challenge.</em></PageTitle><div className="panel sage ready-summary"><div className="focus-row"><Icon name="code"/><div><span className="eyebrow muted">DOMAIN</span><h3>{focus.domain.charAt(0).toUpperCase()+focus.domain.slice(1)}</h3></div></div><div className="focus-row"><Icon name="chart"/><div><span className="eyebrow muted">TOPICS IN FOCUS</span><Chips values={focus.topics}/></div></div><div className="focus-row"><Icon name="file"/><div><span className="eyebrow muted">YOUR TOOLKIT</span><Chips values={focus.skills}/></div></div></div></div><div className="ready-expectations"><span className="eyebrow muted">WHAT TO EXPECT</span><div className="ready-list">{[['Work in an existing codebase','Explore the files, understand the task, and make your changes.'],['Run visible tests','Check your work as you go. Submit for the full test results.'],['Build on your progress','Submit every question in a set to unlock the next one. Earlier questions stay available.']].map(([title,description],i)=><div className="ready-item" key={title}><span>0{i+1}</span><div><h3>{title}</h3><p>{description}</p></div></div>)}</div><div className="rule"/><h2 className="ready-time">60 minutes. <em className="orange">One session.</em></h2><p className="lede small">The timer starts when you begin. Hints and assistance appear only on eligible questions.</p>
  {gen&&<Progress generation={gen} startedAt={state?.started_at}/>}
  {active&&<div className="alert" role="alert"><div><strong>You already have an active assessment.</strong>{stored?<p>Pick up where you left off. Your timer kept running.</p>:<p>It was started in another browser, so it can’t be reopened here. It ends when its 60-minute timer runs out.</p>}</div></div>}
  <ErrorNotice error={error}/>
  <div className="button-row" style={{marginTop:28}}>{active&&stored?<Button onClick={()=>void resume()} busy={busy}>Resume assessment<Icon/></Button>:<Button onClick={()=>void start()} busy={busy} disabled={!!gen&&!failed(state!)}>{busy?(gen?STAGES[gen.status]:'Starting your assessment'):'Start 60-minute assessment'}<Icon/></Button>}<Button className="outline" disabled={busy} onClick={()=>navigate('/portfolio')}>Review portfolio</Button></div>
  {!active&&stored&&!busy&&<button className="text-button" style={{marginTop:20}} onClick={()=>void resume()}>Resume existing assessment ↗</button>}
  <figure className="ready-art"><img src="/landing/assets/assessment.svg" alt="TorqueCode coding workspace illustration"/><figcaption>YOUR NEXT WORKSPACE</figcaption></figure></div></div></section>}

function Progress({generation,startedAt}:{generation:Generation;startedAt?:string}){
 const verified=generation.verification?.semantic_verified;
 return <div className="panel generation-progress" role="status" aria-live="polite" aria-label="Question preparation">
  <span className="eyebrow muted">PREPARING YOUR QUESTIONS</span>
  <h3>{generating({generation} as AssessmentState)&&<span className="spinner"/>} {STAGES[generation.status]}</h3>
  {generating({generation} as AssessmentState)&&<p className="small">Each question’s reference solution runs in the sandbox before it is released, so this can take a minute or two.{startedAt&&<> <Elapsed since={startedAt}/></>}</p>}
  {generation.source&&<p className="small">{SOURCES[generation.source]}</p>}
  {verified!==undefined&&<p className="small"><strong>{verified?'Semantic check passed':'Semantic check did not pass'}</strong>: expected answers come from independent tests, not from the reference solution.</p>}
  {generation.receipts.length>0&&<ul className="receipts" aria-label="Validation receipts">{generation.receipts.map((r,i)=><li key={`${r.gate}-${i}`} data-status={r.status}><b>{r.gate.replaceAll('_',' ')}</b> <span className={`receipt-${r.status}`}>{receiptLabel[r.status]}</span> — {neutral(r.reason)}</li>)}</ul>}
  {generation.status==='failed'&&<p className="small">No questions were released and nothing was graded. You can try again.</p>}
 </div>;
}
const receiptLabel:Record<Generation['receipts'][number]['status'],string>={pass:'passed',fail:'failed',skipped:'skipped',not_applicable:'not applicable'};
function Elapsed({since}:{since:string}){const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);const sec=Math.max(0,Math.round((now-Date.parse(since))/1000));return <span className="muted">{Number.isFinite(sec)?`${sec}s so far.`:''}</span>;}
