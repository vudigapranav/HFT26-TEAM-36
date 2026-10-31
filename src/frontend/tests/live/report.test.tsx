import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {backend,setup,showApp,user} from './harness';
import type {Report} from '../../src/types';

vi.mock('../../src/monaco-setup',()=>({}));
beforeEach(setup);
afterEach(()=>cleanup());
const me:[string,string,{status:number;body:unknown}]=['GET','/auth/me',{status:200,body:{user}}];
const aie={score:14,max:20,independence:0.8,hint_yield:0.5,test_discipline:0.9,gate:1} as const;
const report:Report={report_id:'report-a1',session_id:'a1',final_score:72.5,outcome:'Solved 1 of 2 task(s); highest tier fully solved: novice. Unlocked 1 of 2 further question sets.',
 tasks:[{task_id:'seed-novice-request-summary',passed:5,total:5,time_sec:300,hints_used:0,aie:null},{task_id:'family-adept-dedupe',passed:3,total:5,time_sec:620,hints_used:2,aie}],
 focus_areas:['Practice hashing (adept task not fully solved)'],integrity_signals:[{type:'paste',count:2},{type:'tab_hidden',count:1}],
 claims:[{topic:'arrays',tested_by:'seed-novice-request-summary',demonstrated:true},{topic:'hashing',tested_by:'family-adept-dedupe',demonstrated:false},{topic:'sliding_window',tested_by:null,demonstrated:null}]};

describe('live report (G5)',()=>{
 it('renders score, per-task rows with pass rates, time, hints, AIE, integrity, claims and focus areas',async()=>{
  sessionStorage.setItem('torque-report-id','report-a1');
  backend([me,['GET','/reports/report-a1',{status:200,body:report}]]);
  showApp('/report');
  await screen.findByRole('img',{name:'Final score: 72.5 out of 100'});
  const summary=screen.getByRole('table',{name:/Tests passed, time spent/});
  expect(within(summary).getByText('5 / 5 · 100%')).toBeTruthy();
  expect(within(summary).getByText('3 / 5 · 60%')).toBeTruthy();
  expect(within(summary).getByText('10m 20s')).toBeTruthy();
  expect(within(summary).getByText('family-adept-dedupe')).toBeTruthy();
  expect(screen.getByText(/highest tier fully solved: novice/)).toBeTruthy();
  expect(screen.getAllByText('Independence').length).toBeGreaterThan(0);
  expect(screen.getByText(/Correctness gate: 100%/)).toBeTruthy();
  const claims=screen.getByRole('table',{name:/Each claimed DSA topic/});
  const row=(topic:string)=>within(claims).getByRole('rowheader',{name:topic}).closest('tr')!;
  expect(within(row('arrays')).getByText('Demonstrated')).toBeTruthy();
  expect(within(row('hashing')).getByText('Not demonstrated')).toBeTruthy();
  expect(within(row('sliding window')).getByText('Not tested')).toBeTruthy();
  expect(screen.getByText('Practice hashing (adept task not fully solved)')).toBeTruthy();
  expect(screen.getByText('paste').parentElement?.textContent).toContain('2');
 });
 it('opens the report named in ?id= and explains a report still being prepared',async()=>{
  const calls=backend([me,['GET','/reports/report-b2',{status:409,body:{error:{code:'ASSESSMENT_GENERATING',message:'Request rejected',request_id:'r'}}}]]);
  showApp('/report?id=report-b2');
  await screen.findByText('Your questions are still being prepared and checked.');
  expect(calls.some(c=>c.path==='/reports/report-b2')).toBe(true);
 });
 it('pages past reports with next_cursor → ?before=',async()=>{
  const page1={reports:[{id:'report-c3',created_at:'2026-10-31T09:00:00.000Z',final_score:81,outcome:'Solved 2 of 2'},{id:'report-b2',created_at:'2026-10-31T08:00:00.000Z',final_score:64,outcome:'Solved 1 of 2'}],next_cursor:'report-b2'};
  const page2={reports:[{id:'report-a1',created_at:'2026-10-30T08:00:00.000Z',final_score:40,outcome:'Solved 0 of 1'}]};
  const calls=backend([me,['GET','/reports',({url})=>({status:200,body:url.searchParams.get('before')==='report-b2'?page2:page1})]]);
  const u=userEvent.setup();showApp('/reports');
  await screen.findByText('Solved 2 of 2');
  await u.click(screen.getByRole('button',{name:/Load older reports/}));
  await screen.findByText('Solved 0 of 1');
  expect(calls.filter(c=>c.path==='/reports').map(c=>c.query)).toEqual(['','?before=report-b2']);
  expect(screen.queryByRole('button',{name:/Load older reports/})).toBeNull();
  expect(screen.getByRole('link',{name:/Solved 2 of 2/}).getAttribute('href')).toBe('#/report?id=report-c3');
 });
});
