import {useEffect,useState,type CSSProperties} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import type {AieScore,Report as AssessmentReport} from '../types';
import {api,Button,ErrorNotice,Icon,Skeleton,useApp} from '../lib';
import '../report-react.css';

const percent=(value:number)=>Math.round(Math.max(0,Math.min(1,value))*100);
const minutes=(seconds:number)=>{const rounded=Math.max(0,Math.round(seconds));return `${Math.floor(rounded/60)}m ${String(rounded%60).padStart(2,'0')}s`;};
const stagger=(delay:number)=>({'--delay':`${delay}ms`} as CSSProperties);

function Score({value}:{value:number}){
  const [display,setDisplay]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?value:0);
  useEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setDisplay(value);return;}
    let frame=0;
    const started=performance.now();
    const tick=(now:number)=>{
      const progress=Math.min(1,(now-started)/850);
      setDisplay(Math.round(value*(1-Math.pow(1-progress,3))));
      if(progress<1)frame=requestAnimationFrame(tick);else setDisplay(value);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[value]);
  return <div className="report-score-number" role="img" aria-label={`Final score: ${value} out of 100`}><strong aria-hidden="true">{Number.isInteger(display)?display:display.toFixed(1)}</strong><span className="out-of" aria-hidden="true"> / 100</span></div>;
}

function Efficiency({aie}:{aie:AieScore}){
  return <div className="question-efficiency"><div className="efficiency-score"><span className="eyebrow">AI EFFICIENCY</span><strong>{Number.isInteger(aie.score)?aie.score:aie.score.toFixed(1)}<small> / {aie.max}</small></strong></div>{([
    ['Independence',aie.independence],['Hint yield',aie.hint_yield],['Test discipline',aie.test_discipline],
  ] as [string,number][]).map(([label,value])=><div className="metric-row" key={label}><span>{label}</span><div className="metric-bar" role="img" aria-label={`${label}: ${percent(value)} percent`}><span style={{width:`${percent(value)}%`}}/></div><strong aria-hidden="true">{percent(value)}%</strong></div>)}<p className="small muted">Correctness gate: {percent(aie.gate)}%. Values come from the assessment backend.</p></div>;
}

type ClaimState='demonstrated'|'not_demonstrated'|'not_tested';
const claimState=(d:boolean|null):ClaimState=>d===null?'not_tested':d?'demonstrated':'not_demonstrated';
const CLAIM_LABEL:Record<ClaimState,string>={demonstrated:'Demonstrated',not_demonstrated:'Not demonstrated',not_tested:'Not tested'};

export default function Report(){
  const {mode,toast}=useApp(),[params]=useSearchParams(),requested=params.get('id');
  const [report,setReport]=useState<AssessmentReport|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<unknown>(null);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let current=true;
    setLoading(true);setError(null);setReport(null);
    const reportId=requested||sessionStorage.getItem('torque-report-id')||(__DEMO_BUILD__&&mode==='demo'?'sample':null);
    if(!reportId){setError(new Error('No assessment report is available in this session. Complete an assessment to view its evidence.'));setLoading(false);return;}
    api<AssessmentReport>('GET',`/reports/${encodeURIComponent(reportId)}`).then(result=>{
      if(current)setReport(result);
    }).catch(problem=>{if(current)setError(problem);}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[attempt,mode,requested]);

  if(loading)return <Skeleton/>;
  if(error||!report)return <section className="page report-error-page"><span className="eyebrow orange">THE EVIDENCE IS WORTH A SECOND LOOK</span><h1>Your report,<br/><em>when it’s ready.</em></h1><ErrorNotice error={error||new Error('This report is not available yet.')}/><div className="button-row"><Button onClick={()=>setAttempt(value=>value+1)}>Try again <Icon name="refresh"/></Button><Link className="pill outline" to="/portfolio">Back to portfolio <Icon name="back"/></Link></div></section>;

  const passed=report.tasks.reduce((sum,task)=>sum+task.passed,0);
  const total=report.tasks.reduce((sum,task)=>sum+task.total,0);
  const hints=report.tasks.reduce((sum,task)=>sum+task.hints_used,0);
  const hasEfficiency=report.tasks.some(task=>task.aie!==null);
  const printReport=()=>{toast('Choose “Save as PDF” in your print dialog.');window.print();};

  return <section className="page react-report">
    <div className="report-head reveal">
      <div className="report-intro"><span className="eyebrow orange">{(__DEMO_BUILD__&&mode==='demo')?'SAMPLE ASSESSMENT / THE REPORT':'YOUR ASSESSMENT / THE REPORT'}</span><h1 tabIndex={-1}>The evidence,<br/><em>in one place.</em></h1><p className="lede report-outcome">{report.outcome}</p></div>
      <div className="report-score"><span className="eyebrow muted">{(__DEMO_BUILD__&&mode==='demo')?'ILLUSTRATIVE FINAL SCORE':'FINAL SCORE'}</span><Score value={report.final_score}/><p className="small muted">{(__DEMO_BUILD__&&mode==='demo')?'A sample report from a separate example assessment. It does not grade your current preview attempts.':'Provided by the backend from your assessment evidence.'}</p></div>
    </div>

    {(__DEMO_BUILD__&&mode==='demo')&&<div className="report-sample-note reveal" style={stagger(60)}><span className="sample-note-dot"/><span>INTERACTIVE PREVIEW</span><p>All scores, timing, hints, and activity below are sample data.</p></div>}

    <div className="evidence-ribbon reveal" style={stagger(100)}>
      <div className="ribbon-item"><Icon name="check"/><div><strong>{passed} <span className="ribbon-divider">/ {total}</span></strong><span className="eyebrow muted">TESTS PASSED</span></div></div>
      <div className="ribbon-item"><Icon name="file"/><div><strong>{report.tasks.length}</strong><span className="eyebrow muted">QUESTIONS IN REPORT</span></div></div>
      <div className="ribbon-item"><Icon name="hint"/><div><strong>{hints}</strong><span className="eyebrow muted">HINTS USED</span></div></div>
    </div>

    <div className="report-grid report-overview-grid">
      <section className="panel reveal" style={stagger(140)} aria-labelledby="question-summary"><h2 id="question-summary">QUESTION SUMMARY</h2>{report.tasks.length?<div className="report-table-scroll"><table className="result-table"><caption className="report-sr-only">Tests passed, time spent, and hints used for each question.</caption><thead><tr><th scope="col">QUESTION</th><th scope="col">TESTS</th><th scope="col">TIME</th><th scope="col">HINTS</th></tr></thead><tbody>{report.tasks.map((task,index)=><tr key={task.task_id}><th scope="row">Question {index+1}<small className="report-task-id">{task.task_id}</small></th><td><span>{task.passed} / {task.total} · {task.total?percent(task.passed/task.total):0}%</span><span className="mini-bar" aria-hidden="true"><i style={{width:`${task.total?percent(task.passed/task.total):0}%`}}/></span></td><td>{minutes(task.time_sec)}</td><td>{task.hints_used}</td></tr>)}</tbody></table></div>:<p className="small muted">No question evidence is included in this report.</p>}<p className="report-section-note">Results are shown as supplied by the assessment backend.</p></section>
      <section className="panel report-focus-panel reveal" style={stagger(190)} aria-labelledby="focus-heading"><h2 id="focus-heading">WHERE TO GO NEXT</h2><h3>A little more <em>focus.</em></h3><ol className="focus-areas">{report.focus_areas.map((area,index)=><li key={`${index}-${area}`}><span>{String(index+1).padStart(2,'0')}</span>{area}</li>)}</ol>{!report.focus_areas.length&&<p className="small muted">No additional focus areas were returned for this report.</p>}</section>
    </div>

    <section className="report-question-section reveal" style={stagger(220)} aria-labelledby="question-evidence"><div className="report-section-heading"><div><span className="eyebrow muted">A CLOSER LOOK AT THE WORK</span><h2 id="question-evidence">Question by <em>question.</em></h2></div><span className="small muted">{hasEfficiency?'Assistance evidence appears only where available.':'No assistance-efficiency evidence is included.'}</span></div><div className="report-question-grid">{report.tasks.map((task,index)=><article className="report-question-card" key={task.task_id}>
      <div className="question-card-head"><span className="eyebrow">QUESTION {String(index+1).padStart(2,'0')}</span><span className="question-card-pass">{task.passed} / {task.total} <small>tests</small></span></div>
      <div className="question-pass-track" role="img" aria-label={`${task.passed} of ${task.total} tests passed`}><span style={{width:`${task.total?percent(task.passed/task.total):0}%`}}/></div>
      <div className="question-card-meta"><span><Icon name="clock"/>{minutes(task.time_sec)}</span><span><Icon name="hint"/>{task.hints_used} {task.hints_used===1?'hint':'hints'}</span></div>
      {task.aie?<details className="efficiency-details"><summary>Assistance evidence <span aria-hidden="true">+</span></summary><Efficiency aie={task.aie}/></details>:<p className="question-no-aie">No AI-efficiency evidence for this question.</p>}
    </article>)}</div></section>

    {report.claims&&<section className="panel reveal report-claims" style={stagger(250)} aria-labelledby="claims-heading"><span className="eyebrow muted">WHAT YOU CLAIMED, WHAT YOU SHOWED</span><h2 id="claims-heading">Claims vs <em>demonstrated.</em></h2>{report.claims.length?<div className="report-table-scroll"><table className="result-table"><caption className="report-sr-only">Each claimed DSA topic and whether this assessment demonstrated it.</caption><thead><tr><th scope="col">TOPIC</th><th scope="col">RESULT</th><th scope="col">TESTED BY</th></tr></thead><tbody>{report.claims.map(c=><tr key={c.topic} data-claim={claimState(c.demonstrated)}><th scope="row">{c.topic.replaceAll('_',' ')}</th><td>{CLAIM_LABEL[claimState(c.demonstrated)]}</td><td>{c.tested_by??'—'}</td></tr>)}</tbody></table></div>:<p className="small muted">No claimed topics are listed in this report.</p>}<p className="report-section-note">“Not tested” means no attempted question in this session covered the topic.</p></section>}
    <section className="report-integrity panel reveal" style={stagger(270)} aria-labelledby="integrity-heading"><div><span className="eyebrow muted">CONTEXT, NOT CONCLUSIONS</span><h2 id="integrity-heading">Integrity <em>signals.</em></h2></div><div className="integrity-content"><div className="integrity-items">{report.integrity_signals.map((signal,index)=><span className="chip" key={`${signal.type}-${index}`}>{signal.type.replaceAll('_',' ')}<strong>{signal.count}</strong></span>)}{!report.integrity_signals.length&&<span className="small muted">No signals recorded.</span>}</div><p className="small muted">Signals for review, not automatic verdicts.</p></div></section>

    <div className="report-actions reveal" style={stagger(300)}><p className="small muted">Your next step starts with what you learned.</p><div className="button-row"><Button className="outline" onClick={printReport}>Save as PDF <Icon name="download"/></Button><Link className="pill outline" to="/reports">Past reports <Icon name="chart"/></Link><Link className="pill" to="/portfolio">Back to portfolio <Icon name="arrow"/></Link></div></div>
    <p className="report-bottom-note">{(__DEMO_BUILD__&&mode==='demo')?'DESIGN PREVIEW / SAMPLE DATA · This illustrative report is independent of your current preview edits and submissions.':'All grades and AI-efficiency values are supplied by the backend. Integrity activity is recorded only in the coding workspace.'}</p>
  </section>;
}
