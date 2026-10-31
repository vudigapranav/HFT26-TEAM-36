import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useNavigate} from 'react-router-dom';
import Editor,{type OnMount} from '@monaco-editor/react';
import type {AssessmentState,CandidateTask,File,RunResult} from '@torquecode/contracts';
import '../monaco-setup';
import FinishAssessment,{type FinishPhase} from '../components/FinishAssessment';
import {api,Button,Chips,ErrorNotice,finishDemo,Icon,message,registerLeaveHandler,Skeleton,useApp,type Problem} from '../lib';

type Chat={role:'user'|'assistant';content:string;hint?:number};
type Activity={task_id:string;client_ts:string;type:'tab_hidden'|'tab_visible'|'copy'|'paste';payload:{size?:number}};
function normalize(task:CandidateTask){const files=[...task.files];for(const test of task.visible_tests){if(test.content&&!files.some(f=>f.path===test.path))files.push({path:test.path,content:test.content,editable:false});}return {...task,files};}
function Statement({text}:{text:string}){
 // Render markdown as React text: no HTML from tasks is ever inserted into the DOM.
 const blocks=text.replace(/^# .+\n/,'').split(/(```[\s\S]*?```)/g);
 const inline=(line:string)=>line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((s,i)=>s.startsWith('`')?<code key={i}>{s.slice(1,-1)}</code>:s.startsWith('**')?<strong key={i}>{s.slice(2,-2)}</strong>:s);
 return <div className="task-statement">{blocks.map((b,i)=>b.startsWith('```')?<pre key={i}><code>{b.replace(/^```[^\n]*\n/,'').replace(/```$/,'')}</code></pre>:b.split(/\n\n+/).filter(Boolean).map((p,j)=>/^##? /.test(p)?<h3 key={`${i}-${j}`}>{p.replace(/^##? /,'')}</h3>:<p key={`${i}-${j}`}>{p.split('\n').map((line,k)=><span key={k}>{inline(line)}{k<p.split('\n').length-1&&<br/>}</span>)}</p>))}</div>;
}
export default function Workspace(){
 const model=useApp(),modelRef=useRef(model);modelRef.current=model;
 const navigate=useNavigate(),aid=sessionStorage.getItem('torque-assessment-id');
 const [task,setTask]=useState<CandidateTask|null>(null),taskRef=useRef(task);taskRef.current=task;
 const [fileIndex,setFileIndex]=useState(0),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState<unknown>(null);
 const [working,setWorking]=useState<'run'|'submit'|'unlock'|'finish'|null>(null),workingRef=useRef(false);
 const [finishOpen,setFinishOpen]=useState(new URLSearchParams(window.location.hash.split('?')[1]||'').get('finish')==='1');
 const [saveState,setSaveState]=useState('All changes saved'),[dirty,setDirty]=useState(false),dirtyRef=useRef(false),version=useRef(0),saving=useRef<Promise<void>|null>(null);
 const [notice,setNotice]=useState<unknown>(null),[resultTab,setResultTab]=useState('tests');
 const [chatOpen,setChatOpen]=useState(false),[chats,setChats]=useState<Record<string,Chat[]>>({}),[chatInput,setChatInput]=useState(''),[chatBusy,setChatBusy]=useState(false),[hintBusy,setHintBusy]=useState(false);
 const [hintLevels,setHintLevels]=useState<Record<string,number>>({}),[now,setNow]=useState(Date.now()),[sync,setSync]=useState({remaining:3600,at:Date.now()});
 const events=useRef<Activity[]>([]),flushing=useRef(false),chatLog=useRef<HTMLDivElement>(null),editorRef=useRef<Parameters<OnMount>[0]|null>(null),editorActions=useRef<()=>void>(()=>{}),retry=useState(0);
 function accept(state:AssessmentState){modelRef.current.setAssessment(state);setSync({remaining:state.remaining_sec,at:Date.now()});if(state.status==='finished')navigate('/report',{replace:true});}
 async function save(){
  if(saving.current)await saving.current;
  if(!dirtyRef.current||!taskRef.current||!aid)return;
  const current=taskRef.current,snapshot=version.current;
  const files=current.files.filter(f=>f.editable).map(f=>({...f}));
  setSaveState('Saving…');
  const request=api('PUT',`/assessments/${aid}/tasks/${current.task_id}/files`,{files}).then(()=>{if(version.current===snapshot){dirtyRef.current=false;setDirty(false);setSaveState('All changes saved');}}).catch(error=>{setSaveState('Save failed — retry');throw error;});
  saving.current=request;
  try{await request;}finally{if(saving.current===request)saving.current=null;}
  if(dirtyRef.current&&version.current!==snapshot)await save();
 }
 async function flush(){if(flushing.current||!events.current.length||!aid)return;flushing.current=true;const batch=events.current.splice(0,100);try{await api('POST',`/assessments/${aid}/events`,{events:batch});}catch{events.current.unshift(...batch);events.current=events.current.slice(-100);}finally{flushing.current=false;}}
 useEffect(()=>{
  if(!aid){navigate('/ready',{replace:true});return;}let cancelled=false;
  setLoading(true);setLoadError(null);
  api<AssessmentState>('GET',`/assessments/${aid}/status`).then(async state=>{if(cancelled)return;accept(state);if(state.status==='finished')return;const next=normalize(await api<CandidateTask>('GET',`/assessments/${aid}/tasks/${state.task_id}`));if(!cancelled){setTask(next);setLoading(false);}}).catch(e=>{if(!cancelled){setLoadError(e);setLoading(false);}});
  return ()=>{cancelled=true;};
 },[aid,retry[0]]);
 useEffect(()=>{registerLeaveHandler(save);return()=>registerLeaveHandler(null);},[aid]);
 useEffect(()=>{if(!dirty)return;const timer=setTimeout(()=>void save().catch(()=>{}),1500);return()=>clearTimeout(timer);},[task,dirty]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(!aid||!task||sync.remaining-Math.floor((now-sync.at)/1000)>0)return;let active=true;api<AssessmentState>('GET',`/assessments/${aid}/status`).then(state=>{if(active)accept(state)}).catch(e=>{if(active)setNotice(e)});return()=>{active=false};},[aid,task?.task_id,now,sync]);
 useEffect(()=>{if(!aid)return;let active=true;const timer=setInterval(()=>{if(workingRef.current)return;api<AssessmentState>('GET',`/assessments/${aid}/status`).then(state=>{if(active){accept(state);setNotice((old:unknown)=>(old as Problem)?.code==='SANDBOX_UNAVAILABLE'?old:null);}}).catch(()=>{if(active)setNotice(new Error('Connection interrupted. Your edits are still here; reconnecting…'));});},15000);return()=>{active=false;clearInterval(timer);};},[aid]);
 useEffect(()=>{
  const capture=(type:Activity['type'],size?:number)=>{if(!taskRef.current||modelRef.current.assessment?.status!=='active')return;events.current.push({task_id:taskRef.current.task_id,client_ts:new Date().toISOString(),type,payload:size===undefined?{}:{size:Math.min(size,1000000)}});if(events.current.length>=20)void flush();};
  const visibility=()=>capture(document.hidden?'tab_hidden':'tab_visible');
  const copy=()=>{const input=document.activeElement as HTMLTextAreaElement;capture('copy',typeof input?.selectionStart==='number'?Math.abs(input.selectionEnd-input.selectionStart):getSelection()?.toString().length||0);};
  const paste=(e:ClipboardEvent)=>capture('paste',e.clipboardData?.getData('text').length||0);
  const unload=(e:BeforeUnloadEvent)=>{if(dirtyRef.current){e.preventDefault();e.returnValue='';}};
  document.addEventListener('visibilitychange',visibility);document.addEventListener('copy',copy);document.addEventListener('paste',paste);window.addEventListener('beforeunload',unload);
  const timer=setInterval(()=>void flush(),10000);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('copy',copy);document.removeEventListener('paste',paste);window.removeEventListener('beforeunload',unload);void flush();void save().catch(()=>{});};
 },[aid]);
 useEffect(()=>{chatLog.current?.scrollTo({top:chatLog.current.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[chats,task?.task_id]);
 async function switchTask(id:string){if(workingRef.current||id===task?.task_id)return;setNotice(null);try{await save();const next=normalize(await api<CandidateTask>('GET',`/assessments/${aid}/tasks/${id}`));setTask(next);setFileIndex(0);setResultTab('tests');setChatInput('');}catch(e){setNotice(e);}}
 function edit(value:string|undefined){if(value===undefined||!taskRef.current)return;const current=taskRef.current;if(!current.files[fileIndex]?.editable)return;const next={...current,files:current.files.map((f,i)=>i===fileIndex?{...f,content:value}:f)};taskRef.current=next;version.current++;dirtyRef.current=true;setDirty(true);setSaveState('Unsaved changes');setTask(next);}
 async function execute(mode:'run'|'submit'){
  if(workingRef.current||!taskRef.current)return;workingRef.current=true;setWorking(mode);setNotice(null);
  try{await save();const id=taskRef.current.task_id;const result=await api<RunResult>('POST',`/assessments/${aid}/tasks/${id}/${mode}`,{});modelRef.current.setResults(old=>({...old,[id]:result}));setResultTab('tests');accept(await api<AssessmentState>('GET',`/assessments/${aid}/status`));if(mode==='submit')modelRef.current.toast(modelRef.current.mode==='demo'?'Sample submission recorded.':'Submission recorded.');}
  catch(e){setNotice(e);if((e as Problem).code==='ASSESSMENT_FINISHED')navigate('/report');}
  finally{workingRef.current=false;setWorking(null);}
 }
 async function unlock(){if(workingRef.current)return;workingRef.current=true;setWorking('unlock');setNotice(null);try{await save();const state=await api<AssessmentState>('POST',`/assessments/${aid}/tier/upgrade`,{});const next=normalize(await api<CandidateTask>('GET',`/assessments/${aid}/tasks/${state.task_id}`));accept(state);setTask(next);setFileIndex(0);modelRef.current.toast('Your next question is ready. Earlier work stays available.');}catch(e){setNotice(e);}finally{workingRef.current=false;setWorking(null);}}
 async function finishAssessment(phase:(p:FinishPhase)=>void){
  if(modelRef.current.mode!=='demo'||workingRef.current)throw new Error('Early finishing is available in preview mode only.');
  workingRef.current=true;setWorking('finish');
  try{phase('saving');await save();phase('submitting');for(const id of modelRef.current.assessment?.available_task_ids||[]){const result=await api<RunResult>('POST',`/assessments/${aid}/tasks/${id}/submit`,{});modelRef.current.setResults(old=>({...old,[id]:result}));}phase('closing');await flush();const finished=finishDemo() as AssessmentState;modelRef.current.setAssessment(finished);}
  catch(error){workingRef.current=false;setWorking(null);throw error;}
 }
 function append(id:string,entry:Chat){setChats(old=>({...old,[id]:[...(old[id]||[]),entry]}));}
 async function hint(){if(!task||hintBusy||workingRef.current)return;const id=task.task_id;setHintBusy(true);try{const result=await api<{level:number;text:string}>('POST',`/assessments/${aid}/hint`,{task_id:id});setHintLevels(old=>({...old,[id]:result.level}));append(id,{role:'assistant',content:result.text,hint:result.level});}catch(e){append(id,{role:'assistant',content:message(e)});}finally{setHintBusy(false);}}
 async function send(e:FormEvent){e.preventDefault();if(!task||chatBusy||workingRef.current||!chatInput.trim())return;const id=task.task_id,text=chatInput.trim(),history=(chats[id]||[]).filter(c=>!c.hint).slice(-12).map(({role,content})=>({role,content}));append(id,{role:'user',content:text});setChatInput('');setChatBusy(true);try{const answer=await api<{blocked:boolean;reply?:string;reason?:string}>('POST',`/assessments/${aid}/assistant`,{task_id:id,message:text,history});append(id,{role:'assistant',content:answer.blocked?`The assistant can’t help with that. ${answer.reason||'Ask about your reasoning or a specific error.'}`:answer.reply||''});}catch(e){append(id,{role:'assistant',content:message(e)});}finally{setChatBusy(false);}}
 editorActions.current=()=>void execute('run');
 const mountEditor:OnMount=(editor,monaco)=>{editorRef.current=editor;editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyS,()=>void save().then(()=>modelRef.current.toast('All changes saved.')).catch(e=>setNotice(e)));editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.Enter,()=>editorActions.current());};
 if(loading)return <Skeleton/>;
 if(loadError)return <section className="error-screen"><h1>A small pause.<br/><em>A clear next step.</em></h1><ErrorNotice error={loadError}/><Button onClick={()=>retry[1](n=>n+1)}>Try again <Icon name="refresh"/></Button></section>;
 if(!task||!model.assessment)return null;
 const state=model.assessment,selected=task.files[fileIndex],result=model.results[task.task_id];
 const remaining=Math.max(0,sync.remaining-Math.floor((now-sync.at)/1000)),timer=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
 const disabled=!!working,chat=chats[task.task_id]||[];
 const sandboxDown=(notice as Problem)?.code==='SANDBOX_UNAVAILABLE';
 return <div className={`workspace ${task.assistant_enabled?'assisted':''} ${chatOpen?'assistant-open':''}`}>
  <aside className="task-panel"><div className="question-tabs" aria-label="Available questions">{state.questions.map((q,i)=><button key={q.task_id} className={`question-tab ${q.task_id===task.task_id?'active':''}`} aria-current={q.task_id===task.task_id?'true':undefined} disabled={disabled} onClick={()=>void switchTask(q.task_id)}>{model.results[q.task_id]?.mode==='submit'&&<Icon name="check"/>}Question {i+1}</button>)}</div><span className="eyebrow muted">QUESTION {state.available_task_ids.indexOf(task.task_id)+1} / {task.language}</span><h1 className="task-title" key={task.task_id}>{task.title}</h1><Chips values={task.dsa_topics}/><Statement text={task.statement_md}/><p className="session-note">Work in the editable files. Visible tests help you iterate; Submit runs the full set.<br/><br/>One timer. Earlier questions stay available.</p></aside>
  <section className="editor-column" aria-label="Coding workspace"><div className="editor-top"><button className="save-state save-retry" onClick={()=>void save().catch(e=>setNotice(e))} aria-label={`${saveState}. Click to save.`}><span className="status-dot" style={{background:dirty?'#fa4b23':undefined}}/>{saveState}</button><span className={`timer ${remaining<300?'warning':''}`} aria-label={`${Math.ceil(remaining/60)} minutes remaining`}><Icon name="clock"/><span>{timer}</span> remaining</span></div>
   {!!notice&&<div className="workspace-alert" role="alert"><div><strong>{message(notice)}</strong>{sandboxDown&&<p>No result or grade was recorded for this attempt.</p>}</div><button onClick={()=>{setNotice(null);void execute('run');}}>Try again</button></div>}
   <div className="file-tabs" role="tablist" aria-label="Task files">{task.files.map((file,i)=><button className={`file-tab ${i===fileIndex?'active':''}`} role="tab" aria-selected={i===fileIndex} key={file.path} onClick={()=>setFileIndex(i)}>{file.path.split('/').pop()}{!file.editable&&<Icon name="lock"/>}</button>)}</div>
   <div className="monaco-shell"><Editor height="100%" language="python" theme="torque" path={`${aid}/${task.task_id}/${selected.path}`} value={selected.content} onChange={edit} onMount={mountEditor} loading={<div className="monaco-loading"><span className="spinner"/> Preparing your editor…</div>} options={{readOnly:!selected.editable,domReadOnly:!selected.editable,automaticLayout:true,minimap:{enabled:false},fontFamily:'Consolas, monospace',fontSize:14,lineHeight:26,padding:{top:22,bottom:22},scrollBeyondLastLine:false,smoothScrolling:true,cursorSmoothCaretAnimation:'on',cursorBlinking:'smooth',wordWrap:'off',renderLineHighlight:'line',overviewRulerLanes:0,hideCursorInOverviewRuler:true,scrollbar:{verticalScrollbarSize:6,horizontalScrollbarSize:6},tabSize:4,ariaLabel:`${selected.path} — ${selected.editable?'editable Python':'read only'}`,stickyScroll:{enabled:false}}}/><span className="editor-language">{selected.editable?'PYTHON · UTF-8':'READ ONLY · PYTHON'}</span></div>
   <section className="results" aria-label="Execution results"><div className="results-tabs"><div className="tab-buttons">{['tests','console'].map(tab=><button className={resultTab===tab?'active':''} key={tab} onClick={()=>setResultTab(tab)}>{tab==='tests'?'Test results':'Console'}</button>)}</div><span className="eyebrow" style={{fontSize:7}}>{model.mode==='demo'?'SIMULATED PREVIEW':result?.mode==='submit'?'SUBMISSION':'VISIBLE TESTS'}</span></div><div className="result-scroll" aria-live="polite" key={`${result?.run_id}-${resultTab}`}>
    {working==='run'||working==='submit'?<div className="result-empty"><span className="spinner"/>{working==='submit'?'Submitting for full test results…':'Running visible tests…'}</div>:!result?<div className="result-empty"><Icon name="play"/>Run visible tests to see results.</div>:<>{model.mode==='demo'&&<p className="sample-result">Sample results only. Python is not executed or graded in preview.</p>}{resultTab==='console'?<pre>{result.stdout||'No standard output.'}{result.stderr?`\n\n${result.stderr}`:''}</pre>:<>{result.visible.map(test=><div className="test-row" key={test.id}><span className="test-name" title={test.id}>{test.id.split('::').pop()}</span><span className={`test-status ${test.status==='pass'?'':'fail'}`}><Icon name={test.status==='pass'?'check':'close'}/>{test.status}<span className="muted">{test.duration_ms} ms</span></span></div>)}{result.hidden&&<div className="hidden-result"><span>Hidden tests</span><strong>{result.hidden.passed} / {result.hidden.total} passed</strong></div>}{result.timed_out&&<p>This run exceeded its time limit.</p>}</>}</>}
   </div></section>
   {state.unlock_available&&state.unlocks_used<2&&<div className="unlock-action"><div><strong>Every question in this set is submitted.</strong><span>Keep refining, or take the next challenge.</span></div><Button busy={working==='unlock'} disabled={disabled} onClick={()=>void unlock()}>Unlock next questions <Icon/></Button></div>}
   <div className="editor-actions">{model.mode==='demo'?<Button className="outline finish-entry" disabled={disabled||chatBusy||hintBusy} onClick={()=>setFinishOpen(true)}><Icon name="check"/>Finish assessment<small>PREVIEW</small></Button>:<span className="small muted">SERVER-GRADED EVIDENCE</span>}<div className="button-row">{task.assistant_enabled&&<Button className="outline assistant-toggle" style={{display:'none'}} onClick={()=>setChatOpen(true)} aria-label="Open task assistant"><Icon name="hint"/></Button>}<Button className="outline" disabled={disabled} busy={working==='run'} onClick={()=>void execute('run')}><Icon name="play"/>Run visible tests</Button><Button className="accent" disabled={disabled} busy={working==='submit'} onClick={()=>void execute('submit')}>Submit code <Icon/></Button></div></div>
  </section>
  {task.assistant_enabled&&<aside className="assistant" aria-label="Task assistant"><div className="assistant-head"><span className="eyebrow">TASK ASSISTANT</span><Button busy={hintBusy} disabled={disabled||hintBusy||(hintLevels[task.task_id]||0)>=3} onClick={()=>void hint()}>{(hintLevels[task.task_id]||0)>=3?'Hints used':'Next hint'}<Icon/></Button><button className="icon-button assistant-close" style={{display:'none'}} onClick={()=>setChatOpen(false)} aria-label="Close assistant"><Icon name="close"/></button></div><h2><em>A little guidance.</em></h2><p className="assistant-desc">Ask questions. Get a nudge. Keep your thinking in the driver’s seat.</p><div className="chat-log" ref={chatLog}>{!chat.length&&<div className="chat-message assistant-message"><span className="chat-avatar">✳</span><div className="chat-bubble">Where are you getting stuck? We can work through the reasoning together.</div></div>}{chat.map((entry,i)=><div className={`chat-message ${entry.role==='user'?'user-message':'assistant-message'} ${entry.hint?'hint-message':''}`} key={`${task.task_id}-${i}`}><span className="chat-avatar">{entry.role==='user'?'A':'✳'}</span><div className="chat-bubble">{entry.hint&&<><span className="eyebrow" style={{fontSize:8}}>HINT {entry.hint}</span><br/></>}{entry.content}</div></div>)}{chatBusy&&<div className="chat-thinking" role="status"><span/><span/><span/><span className="sr-only">Assistant is thinking</span></div>}</div><form className="chat-compose" onSubmit={send}><label className="sr-only" htmlFor="chat-input">Ask about this task</label><textarea id="chat-input" value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Ask about this task…" maxLength={2000} required/><button disabled={chatBusy||disabled||!chatInput.trim()} type="submit" aria-label="Send message"><Icon name="send"/></button></form><p className="chat-caption">Guidance, not complete solutions.{model.mode==='demo'?' Sample responses in preview.':''}</p></aside>}
  {model.mode==='demo'&&<FinishAssessment open={finishOpen} questions={state.available_task_ids.map(id=>({id,submitted:model.results[id]?.mode==='submit'}))} remaining={timer} onClose={()=>setFinishOpen(false)} onFinish={finishAssessment} onReport={()=>navigate('/report')}/>}
 </div>;
}
