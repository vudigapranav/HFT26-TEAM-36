import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {backend,problem,setup,showApp,user} from './harness';
import {message} from '../../src/errors';

vi.mock('../../src/monaco-setup',()=>({}));
beforeEach(setup);
afterEach(()=>cleanup());
const password='correct horse battery';

describe('live auth (K2)',()=>{
 it('registers (201), signs in, and lands on the portfolio step',async()=>{
  const calls=backend([['GET','/auth/me',problem(401,'UNAUTHENTICATED')],['POST','/auth/register',{status:201,body:{user}}],['POST','/auth/login',{status:200,body:{user}}]]);
  const u=userEvent.setup();showApp('/register');
  await u.type(await screen.findByLabelText('Email'),user.email);
  await u.type(screen.getByLabelText(/^Password/),password);
  await u.type(screen.getByLabelText('Confirm password'),password);
  await u.click(screen.getByRole('button',{name:/^Create account/}));
  await screen.findByRole('heading',{name:/Let your work/});
  expect(calls.filter(c=>c.method==='POST').map(c=>c.path)).toEqual(['/auth/register','/auth/login']);
  expect(calls.find(c=>c.path==='/auth/register')?.body).toEqual({email:user.email,password});
  expect(sessionStorage.getItem('torquecode-preview-v1')).toBeNull();
 });
 it('checks the 12–128 character rule and the confirmation before calling the backend',async()=>{
  const calls=backend([['GET','/auth/me',problem(401,'UNAUTHENTICATED')]]);
  const u=userEvent.setup();showApp('/register');
  await u.type(await screen.findByLabelText('Email'),user.email);
  await u.type(screen.getByLabelText(/^Password/),'short');
  await u.type(screen.getByLabelText('Confirm password'),'short');
  screen.getByLabelText(/^Password/).removeAttribute('minLength');screen.getByLabelText('Confirm password').removeAttribute('minLength');
  await u.click(screen.getByRole('button',{name:/^Create account/}));
  await screen.findByText(/between 12 and 128 characters/);
  await u.clear(screen.getByLabelText(/^Password/));await u.type(screen.getByLabelText(/^Password/),password);
  await u.clear(screen.getByLabelText('Confirm password'));await u.type(screen.getByLabelText('Confirm password'),password+'!');
  await u.click(screen.getByRole('button',{name:/^Create account/}));
  await screen.findByText(/passwords don’t match/);
  expect(calls.some(c=>c.method==='POST')).toBe(false);
 });
 it('restores the session from /auth/me on reload, and sign-out clears it',async()=>{
  const calls=backend([['GET','/auth/me',{status:200,body:{user}}],['POST','/auth/logout',{status:204}]]);
  sessionStorage.setItem('torque-assessment-id','a1');sessionStorage.setItem('torque-report-id','report-a1');
  const u=userEvent.setup();showApp('/portfolio');
  await screen.findByRole('heading',{name:/Let your work/});
  expect(screen.getByText(user.email)).toBeTruthy();
  await u.click(screen.getByRole('button',{name:'Sign out'}));
  await screen.findByRole('heading',{name:'Sign in'});
  expect(calls.some(c=>c.method==='POST'&&c.path==='/auth/logout')).toBe(true);
  expect(sessionStorage.getItem('torque-assessment-id')).toBeNull();
  expect(sessionStorage.getItem('torque-report-id')).toBeNull();
 });
 it.each([
  [problem(401,'INVALID_CREDENTIALS'),/email and password don’t match/],
  [problem(429,'RATE_LIMITED',{'Retry-After':'30'}),/Too many attempts\. Try again in 30 seconds\./],
 ])('maps sign-in failures to clear messages (%#)',async(reply,text)=>{
  backend([['GET','/auth/me',problem(401,'UNAUTHENTICATED')],['POST','/auth/login',reply]]);
  const u=userEvent.setup();showApp('/login');
  await u.type(await screen.findByLabelText('Email'),user.email);
  await u.type(screen.getByLabelText(/^Password/),password);
  await u.click(screen.getByRole('button',{name:/^Sign in/}));
  await screen.findByText(text);
  expect(screen.queryByText('Request rejected')).toBeNull();
 });
 it('maps a duplicate registration (409) to "sign in instead"',async()=>{
  backend([['GET','/auth/me',problem(401,'UNAUTHENTICATED')],['POST','/auth/register',problem(409,'ACCOUNT_EXISTS')]]);
  const u=userEvent.setup();showApp('/register');
  await u.type(await screen.findByLabelText('Email'),user.email);
  await u.type(screen.getByLabelText(/^Password/),password);
  await u.type(screen.getByLabelText('Confirm password'),password);
  await u.click(screen.getByRole('button',{name:/^Create account/}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toMatch(/already exists\. Sign in instead/));
 });
});

describe('error mapping (G10)',()=>{
 const codes=['SEED_TOPIC_UNAVAILABLE','SANDBOX_UNAVAILABLE','LLM_UNAVAILABLE','EXECUTION_IN_PROGRESS','HINTS_EXHAUSTED','HINT_IN_PROGRESS','ASSISTANT_IN_PROGRESS','UNLOCK_NOT_AVAILABLE','ASSESSMENT_FINISHED','PORTFOLIO_REQUIRED','PERSISTENCE_UNAVAILABLE','ASSESSMENT_GENERATING','ASSESSMENT_ACTIVE','TASK_VALIDATION_FAILED','TASK_LOCKED','ASSISTANCE_DISABLED'];
 it.each(codes)('%s has its own message',code=>{
  const text=message({code,status:409,message:'Request rejected'} as never);
  expect(text).not.toBe('Request rejected');expect(text).not.toMatch(/Something went wrong/);
 });
 it('tells the candidate to claim arrays when no question can be served (422)',()=>{
  expect(message({code:'SEED_TOPIC_UNAVAILABLE',status:422} as never)).toMatch(/arrays.*dsa_topics_solved/);
 });
 it('adds Retry-After to any 429 and falls back by status for unknown codes',()=>{
  expect(message({code:'RUNNER_BUSY',status:429,retry_after:1} as never)).toMatch(/Try again in 1 second\.$/);
  expect(message({code:'ASSISTANT_LIMIT',status:429} as never)).toMatch(/wait a moment/);
  expect(message({code:'SOMETHING_NEW',status:503,message:'Request rejected'} as never)).toBe('The service had a problem. Please try again.');
 });
});
