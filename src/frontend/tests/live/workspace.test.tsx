import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {AID,assessmentState,backend,candidateTask,setup,showApp,user,type Handler} from './harness';
import type {AssessmentState} from '../../src/types';

vi.mock('../../src/monaco-setup',()=>({}));
vi.mock('@monaco-editor/react',async()=>(await import('./harness')).editorMock);
beforeEach(()=>{setup();sessionStorage.setItem('torque-assessment-id',AID);});
afterEach(()=>cleanup());
const me:[string,string,Handler]=['GET','/auth/me',{status:200,body:{user}}];
const S=`/assessments/${AID}`;
const routes=(state:()=>AssessmentState,extra:[string,string|RegExp,Handler][]=[])=>backend([me,['GET',`${S}/status`,()=>({status:200,body:state()})],['GET',/\/tasks\/question-\d$/,({url})=>({status:200,body:candidateTask(url.pathname.split('/').pop())})],...extra]);
const LEVELS=/\b(novice|adept|master)\b/i;

describe('live workspace',()=>{
 it('shows the server timer and re-syncs it from /status every 15 s',async()=>{
  let remaining=1500;
  const calls=routes(()=>assessmentState({remaining_sec:remaining}));
  showApp('/workspace');
  await screen.findByRole('heading',{name:/question-1/});
  expect(screen.getByLabelText('25 minutes remaining')).toBeTruthy();
  const before=calls.filter(c=>c.path.endsWith('/status')).length;
  remaining=600;
  await waitFor(()=>expect(calls.filter(c=>c.path.endsWith('/status')).length).toBeGreaterThan(before),{timeout:17_000,interval:250});
  await waitFor(()=>expect(screen.getByLabelText('10 minutes remaining')).toBeTruthy());
 },25_000);
 it('autosaves exactly the editable file set',async()=>{
  const calls=routes(()=>assessmentState(),[['PUT',`${S}/tasks/question-1/files`,{status:200,body:{ok:true}}]]);
  const u=userEvent.setup();showApp('/workspace');
  const editor=await screen.findByRole('textbox',{name:'app/summary.py — editable Python'});
  await u.type(editor,'# edit');
  await waitFor(()=>expect(calls.some(c=>c.method==='PUT')).toBe(true),{timeout:4000});
  const body=calls.find(c=>c.method==='PUT')!.body;
  expect(body.files.map((f:{path:string})=>f.path)).toEqual(['app/summary.py']);
  expect(body.files[0].editable).toBe(true);expect(body.files[0].content).toContain('# edit');
 });
 it('shows visible test details and only the hidden aggregate after Submit',async()=>{
  const result={run_id:'r1',task_id:'question-1',mode:'submit',visible:[{id:'tests/test_visible.py::test_peak',status:'fail',duration_ms:4}],hidden:{passed:2,total:3},passed:2,total:4,stdout:'',stderr:'',timed_out:false};
  routes(()=>assessmentState(),[['POST',`${S}/tasks/question-1/submit`,{status:200,body:result}]]);
  const u=userEvent.setup();showApp('/workspace');
  await u.click(await screen.findByRole('button',{name:/Submit code/}));
  await screen.findByText('2 / 3 passed');
  expect(screen.getByText('test_peak')).toBeTruthy();
  expect(screen.getByText('Hidden tests')).toBeTruthy();
 });
 it('offers "Unlock next questions" only when unlock_available is true, and never past two unlocks',async()=>{
  let state=assessmentState({unlock_available:false});
  routes(()=>state,[['POST',`${S}/tier/upgrade`,()=>{state=assessmentState({unlocks_used:1,unlock_available:false,task_id:'question-2',available_task_ids:['question-1','question-2'],questions:[{task_id:'question-1',assistant_enabled:false},{task_id:'question-2',assistant_enabled:true}]});return {status:200,body:state};}]]);
  const u=userEvent.setup();const view=showApp('/workspace');
  await screen.findByRole('heading',{name:/question-1/});
  expect(screen.queryByRole('button',{name:/Unlock next questions/})).toBeNull();
  view.unmount();state=assessmentState({unlock_available:true});showApp('/workspace');
  await u.click(await screen.findByRole('button',{name:/Unlock next questions/}));
  await screen.findByRole('heading',{name:/question-2/});
  expect(screen.getByText(/QUESTION SET 2 · QUESTION 2/)).toBeTruthy();
  cleanup();state=assessmentState({unlock_available:true,unlocks_used:2});showApp('/workspace');
  await screen.findByRole('heading',{name:/question-1/});
  expect(screen.queryByRole('button',{name:/Unlock next questions/})).toBeNull();
 });
 it('shows Hint and Assistant only where the status says assistant_enabled, and never names a level',async()=>{
  const state=assessmentState({task_id:'question-2',available_task_ids:['question-1','question-2'],unlocks_used:1,questions:[{task_id:'question-1',assistant_enabled:false},{task_id:'question-2',assistant_enabled:true}]});
  routes(()=>state);
  const u=userEvent.setup();showApp('/workspace');
  await screen.findByRole('complementary',{name:'Task assistant'});
  expect(screen.getByRole('button',{name:/Next hint/})).toBeTruthy();
  await u.click(screen.getByRole('button',{name:'Question 1'}));
  await screen.findByRole('heading',{name:/question-1/});
  expect(screen.queryByRole('complementary',{name:'Task assistant'})).toBeNull();
  expect(document.body.textContent).not.toMatch(LEVELS);
 });
 it('batches integrity events to /events only while the workspace is mounted',async()=>{
  const calls=routes(()=>assessmentState(),[['POST',`${S}/events`,{status:200,body:{ok:true}}]]);
  const view=showApp('/workspace');
  await screen.findByRole('heading',{name:/question-1/});
  fireEvent.paste(document,{clipboardData:{getData:()=>'pasted text'}});
  view.unmount();
  await waitFor(()=>expect(calls.some(c=>c.path===`${S}/events`)).toBe(true));
  const sent=calls.filter(c=>c.path===`${S}/events`).flatMap(c=>c.body.events);
  expect(sent.map((e:{type:string})=>e.type)).toContain('paste');
  expect(sent.find((e:{type:string})=>e.type==='paste').payload.size).toBe(11);
  const count=calls.length;
  fireEvent.paste(document,{clipboardData:{getData:()=>'after unmount'}});
  await new Promise(r=>setTimeout(r,50));
  expect(calls.length).toBe(count);
 });
 it('maps runner and assistant outages to clear messages (G10)',async()=>{
  const state=assessmentState({questions:[{task_id:'question-1',assistant_enabled:true}]});
  routes(()=>state,[['POST',`${S}/tasks/question-1/run`,{status:503,body:{error:{code:'SANDBOX_UNAVAILABLE',message:'Request rejected',request_id:'r'}}}],['POST',`${S}/assistant`,{status:503,body:{error:{code:'LLM_UNAVAILABLE',message:'Request rejected',request_id:'r'}}}]]);
  const u=userEvent.setup();showApp('/workspace');
  await u.click(await screen.findByRole('button',{name:/Run visible tests/}));
  await screen.findByText(/code runner is temporarily unavailable/);
  await u.type(screen.getByLabelText('Ask about this task'),'why?');
  await u.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText(/assistant is unavailable right now/);
  expect(screen.queryByText('Request rejected')).toBeNull();
 });
});
