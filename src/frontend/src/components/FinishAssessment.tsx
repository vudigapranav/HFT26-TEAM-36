import {useEffect,useRef,useState} from 'react';
import {Button,ErrorNotice,Icon} from '../lib';
import './finish.css';
export type FinishPhase='saving'|'submitting'|'closing';
export default function FinishAssessment({open,questions,remaining,onClose,onFinish,onReport}:{open:boolean;questions:{id:string;submitted:boolean}[];remaining:string;onClose:()=>void;onFinish:(phase:(p:FinishPhase)=>void)=>Promise<void>;onReport:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),[phase,setPhase]=useState<FinishPhase|'review'|'complete'>('review'),[error,setError]=useState<unknown>(null);
 const busy=phase!=='review'&&phase!=='complete';
 useEffect(()=>{if(open){setPhase('review');setError(null);ref.current?.showModal();}else ref.current?.close()},[open]);
 async function finish(){if(busy||phase==='complete')return;setError(null);setPhase('saving');try{await onFinish(setPhase);setPhase('complete');}catch(e){setError(e);setPhase('review');}}
 const submitted=questions.filter(q=>q.submitted).length;
 return <dialog className="finish-dialog" ref={ref} aria-labelledby="finish-title" onCancel={e=>{if(busy||phase==='complete')e.preventDefault();else onClose()}} onClick={e=>{if(e.target===ref.current&&!busy&&phase==='review')onClose()}}>
  <div className="finish-eyebrow"><span className="eyebrow orange">{phase==='complete'?'SESSION COMPLETE':'WRAP UP YOUR WORK'}</span><span className="finish-preview-tag">PREVIEW ONLY</span></div>
  {phase==='complete'?<section className="finish-complete"><span className="finish-seal"><Icon name="check"/></span><h2 id="finish-title">Finished early.<br/><em>Ready for the evidence.</em></h2><p>Your sample session is closed. Open the report to see how the final experience will look.</p><div className="finish-complete-note"><Icon name="file"/><span>Sample report ready<span>Illustrative results · not a grade of your code</span></span></div><Button className="full" onClick={onReport}>View sample report <Icon/></Button></section>:<>
   <h2 id="finish-title" aria-label="Ready to call it complete?">Ready to<br/><em>call it complete?</em></h2><p className="finish-description">You can finish before the timer runs out. We’ll save your latest edits and submit every available question before closing this sample session.</p>
   <div className="finish-summary"><div><strong>{remaining}</strong><span>TIME REMAINING</span></div><div><strong>{questions.length}</strong><span>AVAILABLE QUESTIONS</span></div></div>
   <div className="finish-question-list" aria-label="Questions to include">{questions.map((q,i)=><div key={q.id}><span className={`finish-question-icon ${q.submitted?'done':''}`}><Icon name={q.submitted?'check':'file'}/></span><strong>Question {i+1}</strong><span>{q.submitted?'Submitted this visit':'Will submit on finish'}</span></div>)}</div>
   <p className="finish-detail">{submitted} of {questions.length} submitted this visit. All available questions will be submitted again using their latest saved files. Further questions won’t be unlocked.</p>
   <div className="finish-progress" aria-live="polite">{(['saving','submitting','closing'] as FinishPhase[]).map((step,i)=>{const current=['saving','submitting','closing'].indexOf(phase),done=phase!=='review'&&i<current;return <div className={`${phase===step?'current':''} ${done?'done':''}`} key={step}><span>{done?<Icon name="check"/>:phase===step?<span className="spinner"/>:String(i+1).padStart(2,'0')}</span>{['Save edits','Submit questions','Close session'][i]}</div>})}</div>
   <ErrorNotice error={error}/><div className="finish-dialog-actions"><Button className="outline" disabled={busy} onClick={onClose}>Keep working</Button><Button className="accent" busy={busy} onClick={()=>void finish()}>{busy?'Wrapping up…':'Finish & view report'}{!busy&&<Icon name="check"/>}</Button></div>
   <p className="finish-footnote">This demonstrates early finishing with sample data. Real assessments still need a backend finish endpoint.</p>
  </>}
 </dialog>;
}
