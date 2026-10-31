import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {AID,assessmentState,backend,candidateTask,problem,setup,showApp,user} from './harness';

vi.mock('../../src/monaco-setup',()=>({}));
vi.mock('@monaco-editor/react',async()=>(await import('./harness')).editorMock);
beforeEach(()=>{setup();sessionStorage.setItem('torque-focus',JSON.stringify({domain:'backend',skills:['sql'],topics:['arrays']}));});
afterEach(()=>cleanup());
const me:[string,string,{status:number;body:unknown}]=['GET','/auth/me',{status:200,body:{user}}];
const receipts=[{gate:'schema',status:'pass',reason:'Complete task and test manifest'},{gate:'performance',status:'not_applicable',reason:'No Master runtime requirement'},{gate:'differential',status:'pass',reason:'Reference agrees with independent oracle'}] as const;

describe('start an assessment (G3/G4)',()=>{
 it('polls status every 2 s while validating, shows receipts, and opens a task only once ready',async()=>{
  const validating=assessmentState({generation:{status:'validating',progress:{status:'validating'},receipts:[...receipts],verification:{policy:'trusted-families-v1',semantic_verified:true},source:'seed_bank'}});
  const ready=assessmentState({generation:{...validating.generation!,status:'ready'}});
  let polls=0;
  const calls=backend([me,['POST','/assessments',{status:201,body:validating}],['GET',`/assessments/${AID}/status`,()=>({status:200,body:++polls<2?validating:ready})],['GET',`/assessments/${AID}/tasks/question-1`,{status:200,body:candidateTask()}]]);
  const u=userEvent.setup();showApp('/ready');
  await u.click(await screen.findByRole('button',{name:/Start 60-minute assessment/}));
  const progress=await screen.findByRole('status',{name:'Question preparation'});
  expect(progress.textContent).toMatch(/Checking every question against independent tests/);
  expect(progress.textContent).toMatch(/Semantic check passed/);
  expect(progress.textContent).toMatch(/From the reviewed question bank/);
  expect(progress.textContent).toMatch(/performance not applicable/);
  expect(progress.textContent).not.toMatch(/\b(novice|adept|master)\b/i);
  await screen.findByRole('heading',{name:/Fix the request summary question-1/},{timeout:8000});
  const firstTask=calls.findIndex(c=>c.path.includes('/tasks/'));
  const readyPoll=calls.findIndex((c,i)=>c.path.endsWith('/status')&&i<firstTask&&polls>=2);
  expect(firstTask).toBeGreaterThan(readyPoll);
  expect(calls.slice(0,firstTask).filter(c=>c.path.endsWith('/status')).length).toBeGreaterThanOrEqual(2);
 },15000);
 it('shows a failed validation without releasing questions',async()=>{
  const calls=backend([me,['POST','/assessments',{status:201,body:assessmentState({generation:{status:'failed',progress:{},receipts:[]}})}]]);
  const u=userEvent.setup();showApp('/ready');
  await u.click(await screen.findByRole('button',{name:/Start 60-minute assessment/}));
  await screen.findByText(/No questions were released and nothing was graded/);
  expect(calls.some(c=>c.path.includes('/tasks/'))).toBe(false);
 });
 it('resumes the stored active assessment on 409 ASSESSMENT_ACTIVE',async()=>{
  localStorage.setItem(`torque-active-assessment:${user.user_id}`,JSON.stringify({assessment_id:AID,report_id:`report-${AID}`}));
  backend([me,['POST','/assessments',problem(409,'ASSESSMENT_ACTIVE')],['GET',`/assessments/${AID}/status`,{status:200,body:assessmentState()}],['GET',`/assessments/${AID}/tasks/question-1`,{status:200,body:candidateTask()}]]);
  const u=userEvent.setup();showApp('/ready');
  await u.click(await screen.findByRole('button',{name:/Start 60-minute assessment/}));
  await screen.findByText('You already have an active assessment.');
  await u.click(screen.getByRole('button',{name:/Resume assessment/}));
  await screen.findByRole('heading',{name:/Fix the request summary question-1/});
 });
 it('says so when the active assessment was started in another browser (no stored id)',async()=>{
  backend([me,['POST','/assessments',problem(409,'ASSESSMENT_ACTIVE')]]);
  const u=userEvent.setup();showApp('/ready');
  await u.click(await screen.findByRole('button',{name:/Start 60-minute assessment/}));
  await screen.findByText(/started in another browser/);
  expect(screen.queryByRole('button',{name:/Resume assessment/})).toBeNull();
 });
 it('the workspace keeps polling through 409 ASSESSMENT_GENERATING before loading the task',async()=>{
  sessionStorage.setItem('torque-assessment-id',AID);
  let taskCalls=0;
  backend([me,['GET',`/assessments/${AID}/status`,{status:200,body:assessmentState()}],['GET',`/assessments/${AID}/tasks/question-1`,()=>++taskCalls<2?problem(409,'ASSESSMENT_GENERATING'):{status:200,body:candidateTask()}]]);
  showApp('/workspace');
  await screen.findByRole('heading',{name:/Fix the request summary question-1/},{timeout:8000});
  expect(taskCalls).toBe(2);
 },15000);
 it('the workspace shows preparation progress instead of requesting tasks while generating',async()=>{
  sessionStorage.setItem('torque-assessment-id',AID);
  const calls=backend([me,['GET',`/assessments/${AID}/status`,{status:200,body:assessmentState({generation:{status:'generating',progress:{status:'generating'},receipts:[]}})}]]);
  showApp('/workspace');
  await screen.findByRole('heading',{name:/Preparing your questions/});
  await new Promise(r=>setTimeout(r,2300));
  expect(calls.filter(c=>c.path.endsWith('/status')).length).toBeGreaterThanOrEqual(2);
  expect(calls.some(c=>c.path.includes('/tasks/'))).toBe(false);
 },15000);
});
