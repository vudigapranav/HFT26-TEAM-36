import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {backend,problem,setup,showApp,user} from './harness';

vi.mock('../../src/monaco-setup',()=>({}));
beforeEach(setup);
afterEach(()=>cleanup());
const me:[string,string,{status:number;body:unknown}]=['GET','/auth/me',{status:200,body:{user}}];
const profile={domain:'backend',domain_confidence:0.94,claimed_topics:['arrays','strings'],tech_stack:['python'],skills:['sql']};
const questions=[
 {id:'q1',prompt:'Which work feels most like you?',options:[{id:'a',text:'APIs'},{id:'b',text:'Data pipelines'}]},
 {id:'q2',prompt:'Where do you want to be assessed?',options:[{id:'c',text:'Arrays'},{id:'d',text:'Strings'}]},
];

describe('live portfolio + quiz',()=>{
 it('shows the parsed profile, the empty-topic fallback warning and injection flags',async()=>{
  const warnings=['No DSA topics claimed, using fallback arrays, strings.'];
  const calls=backend([me,['POST','/portfolio',{status:200,body:{profile,warnings,injection_flags:['projects[0].description']}}]]);
  const u=userEvent.setup();showApp('/portfolio');
  await u.click(await screen.findByRole('button',{name:/Validate portfolio/}));
  await screen.findByRole('heading',{name:'Portfolio validated'});
  expect(screen.getByText('Backend')).toBeTruthy();
  expect(screen.getByText('94% confidence')).toBeTruthy();
  expect(screen.getByText(warnings[0])).toBeTruthy();
  expect(screen.getByText('projects[0].description')).toBeTruthy();
  expect(calls.find(c=>c.path==='/portfolio')?.body.candidate).toBeTruthy();
 });
 it('lists each field error beside the JSON (422)',async()=>{
  backend([me,['POST','/portfolio',{status:422,body:{error:{code:'INVALID_PORTFOLIO',message:'Invalid portfolio',request_id:'r',fields:[{path:'/candidate/email',message:'must match format "email"'},{path:'/projects/0/name',message:'must NOT have fewer than 1 characters'}]}}}]]);
  const u=userEvent.setup();showApp('/portfolio');
  await u.click(await screen.findByRole('button',{name:/Validate portfolio/}));
  const list=await waitFor(()=>{const el=document.getElementById('portfolio-field-errors');if(!el)throw Error('no list');return el;});
  expect(within(list).getByText('/candidate/email')).toBeTruthy();
  expect(within(list).getByText('/projects/0/name')).toBeTruthy();
  expect(screen.getByLabelText('PORTFOLIO.JSON').getAttribute('aria-invalid')).toBe('true');
 });
 it('runs GET then POST /onboarding-quiz with one answer per question and moves on',async()=>{
  sessionStorage.setItem('torque-portfolio',JSON.stringify({profile,warnings:[],injection_flags:[]}));
  const calls=backend([me,['GET','/onboarding-quiz',{status:200,body:{questions}}],['POST','/onboarding-quiz',{status:200,body:{focus_lane:{domain:'backend',skills:['sql'],topics:['arrays']}}}]]);
  const u=userEvent.setup();showApp('/quiz');
  await u.click(await screen.findByRole('radio',{name:/APIs/}));
  await u.click(screen.getByRole('button',{name:/Next question/}));
  await u.click(await screen.findByRole('radio',{name:/Arrays/}));
  await u.click(screen.getByRole('button',{name:/Review my focus/}));
  await waitFor(()=>expect(window.location.hash).toBe('#/ready'));
  expect(calls.find(c=>c.method==='POST'&&c.path==='/onboarding-quiz')?.body).toEqual({answers:[{question_id:'q1',option_id:'a'},{question_id:'q2',option_id:'c'}]});
 });
 it('maps PORTFOLIO_REQUIRED from the quiz to a clear next step',async()=>{
  backend([me,['GET','/onboarding-quiz',problem(409,'PORTFOLIO_REQUIRED')]]);
  showApp('/quiz');
  await screen.findByText('Upload and validate your portfolio first.');
 });
});
