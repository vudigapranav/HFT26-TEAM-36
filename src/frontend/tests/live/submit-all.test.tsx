import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {AID,assessmentState,backend,candidateTask,setup,showApp,user} from './harness';

vi.mock('../../src/monaco-setup',()=>({}));
vi.mock('@monaco-editor/react',async()=>(await import('./harness')).editorMock);
beforeEach(()=>{setup();sessionStorage.setItem('torque-assessment-id',AID);});
afterEach(()=>cleanup());
const S=`/assessments/${AID}`;
const submitted=(id:string)=>({status:200,body:{run_id:`r-${id}`,task_id:id,mode:'submit',visible:[],hidden:{passed:1,total:2},passed:1,total:2,stdout:'',stderr:'',timed_out:false}});

it('live mode replaces "Finish assessment" with "Submit all questions" and never fakes a finished session (G6)',async()=>{
 const state=assessmentState({available_task_ids:['question-1','question-2'],questions:[{task_id:'question-1',assistant_enabled:false},{task_id:'question-2',assistant_enabled:true}],unlocks_used:1});
 const calls=backend([['GET','/auth/me',{status:200,body:{user}}],['GET',`${S}/status`,{status:200,body:state}],['GET',/\/tasks\/question-\d$/,({url})=>({status:200,body:candidateTask(url.pathname.split('/').pop())})],
  ['POST',`${S}/tasks/question-1/submit`,submitted('question-1')],['POST',`${S}/tasks/question-2/submit`,submitted('question-2')]]);
 const u=userEvent.setup();showApp('/workspace');
 await screen.findByRole('heading',{name:/question-1/});
 expect(screen.queryByRole('button',{name:/Finish assessment/})).toBeNull();
 await u.click(screen.getByRole('button',{name:/Submit all questions/}));
 const done=await screen.findByText('Every open question is submitted.');
 expect(calls.filter(c=>c.method==='POST'&&c.path.endsWith('/submit')).map(c=>c.path)).toEqual([`${S}/tasks/question-1/submit`,`${S}/tasks/question-2/submit`]);
 const banner=done.closest('[role="status"]') as HTMLElement;
 expect(banner.textContent).toMatch(/ends when the timer reaches 0:00/);
 expect(within(banner).getByRole('link',{name:/View current report/}).getAttribute('href')).toBe('#/report');
 expect(calls.some(c=>/finish|end/.test(c.path))).toBe(false);
 expect(screen.getByLabelText(/minutes remaining/)).toBeTruthy();
});
