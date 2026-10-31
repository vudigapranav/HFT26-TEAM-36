// Live-mode test harness: renders the real App and answers its /api requests from a route table.
// Responses use the backend's documented shapes; nothing falls back to the preview adapter.
import {render} from '@testing-library/react';
import {HashRouter} from 'react-router-dom';
import {vi} from 'vitest';
import App from '../../src/App';
import {AppProvider} from '../../src/lib';

export type Reply={status:number;body?:unknown;headers?:Record<string,string>};
export type Handler=Reply|((ctx:{body:any;url:URL;method:string;calls:Call[]})=>Reply|Promise<Reply>);
export type Call={method:string;path:string;query:string;body:any};
export const problem=(status:number,code:string,headers?:Record<string,string>):Reply=>({status,headers,body:{error:{code,message:'Request rejected',request_id:'test'}}});

export function backend(routes:[string,string|RegExp,Handler][]){
 const calls:Call[]=[];
 globalThis.fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input),'http://localhost');
  if(!url.pathname.startsWith('/api/'))throw new Error(`Unexpected non-API request: ${url.pathname}`);
  const path=url.pathname.slice(4),method=(init?.method||'GET').toUpperCase(),body=init?.body?JSON.parse(String(init.body)):undefined;
  calls.push({method,path,query:url.search,body});
  const route=routes.find(([m,p])=>m===method&&(typeof p==='string'?p===path:p.test(path)));
  if(!route)return new Response(JSON.stringify({error:{code:'NOT_FOUND',message:'Request rejected',request_id:'t'}}),{status:404});
  const reply=typeof route[2]==='function'?await route[2]({body,url,method,calls}):route[2];
  if(reply.status===204)return new Response(null,{status:204});
  return new Response(JSON.stringify(reply.body??{}),{status:reply.status,headers:{'Content-Type':'application/json',...reply.headers}});
 }) as typeof fetch;
 return calls;
}
export function showApp(path:string){window.history.replaceState(null,'',`/#${path}`);return render(<HashRouter><AppProvider><App/></AppProvider></HashRouter>);}
export function setup(){
 sessionStorage.clear();localStorage.clear();
 window.matchMedia=vi.fn().mockImplementation(()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 Element.prototype.scrollTo=vi.fn();
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
}
export const user={user_id:'0b6f6d1c-6c1a-4b0e-9a8a-2b1f7c1d9e10',email:'candidate@example.org'};

import type {AssessmentState,CandidateTask} from '../../src/types';
export const AID='a0b1c2d3';
export function assessmentState(over:Partial<AssessmentState>={}):AssessmentState{
 return {assessment_id:AID,report_id:`report-${AID}`,task_id:'question-1',available_task_ids:['question-1'],questions:[{task_id:'question-1',assistant_enabled:false}],
  unlock_available:false,unlocks_used:0,status:'active',started_at:'2026-10-31T08:00:00.000Z',expires_at:new Date(Date.now()+3_000_000).toISOString(),
  remaining_sec:3000,policy_todos:[],runner:'isolated',runner_available:true,...over};
}
export function candidateTask(id='question-1',over:Partial<CandidateTask>={}):CandidateTask{
 return {task_id:id,domain:'backend',language:'python',task_type:'bug_fix',title:`Fix the request summary ${id}`,statement_md:'Fix `peak_requests`.',dsa_topics:['arrays'],
  files:[{path:'app/summary.py',content:'def peak_requests(counts):\n    return 0\n',editable:true},{path:'app/models.py',content:'X = 1\n',editable:false}],
  visible_tests:[{id:'tests/test_visible.py::test_peak',path:'tests/test_visible.py',content:'def test_peak(): pass\n'}],source:'seed_bank',assistant_enabled:false,...over};
}
export const editorMock={default:({value,onChange,options}:{value:string;onChange:(v:string)=>void;options:{readOnly:boolean;ariaLabel:string}})=><textarea aria-label={options.ariaLabel} readOnly={options.readOnly} value={value} onChange={e=>onChange(e.target.value)}/>};
