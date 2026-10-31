// Server-owned contracts and independent answer keys. No model output is executable here.
import { loadSeedBank } from '../api/seed-bank.js';
import type { Domain, PrivateTask, TestFile, Topic } from '../contracts/internal.js';
import { pyLiteral, renderTests, type Outcome } from './template.js';

export const VALIDATION_POLICY='trusted-families-v1';
export type FamilyId = 'request_peak_v1'|'second_largest_v1'|'event_dedupe_v1'|'session_window_v1';
export type ScenarioId = 'operations'|'reliability'|'analytics';
export type OracleCase = { module:string; func:string; args:unknown[]; outcome:Outcome };
export type Family = {
  id:FamilyId; base:PrivateTask; contract:string; examples:OracleCase[]; cases:OracleCase[];
  performanceIds:string[];
};
const tuple = (v:unknown[]) => ({__t:'tuple',v});
const value = (v:unknown):Outcome => ({kind:'value',value:v});
const raises:Outcome={kind:'raises',exception:'ValueError'};
const example = (module:string,func:string,args:unknown[],expected:unknown):OracleCase => ({module,func,args,outcome:value(expected)});

// These use different algorithms from the Python references: sorting, exhaustive selection,
// and exhaustive window enumeration. They never call or import a task reference.
export function peakOracle(counts:number[]):number { return [...counts].sort((a,b)=>b-a)[0]??0; }
export function secondLargestOracle(nums:number[]):number|null { return [...new Set(nums)].sort((a,b)=>b-a)[1]??null; }
export function dedupeOracle(rows:unknown[][]):unknown[][] {
  const ids=[...new Set(rows.map(r=>r[1]))];
  return ids.map(id=>rows.map((row,index)=>({row,index})).filter(x=>x.row[1]===id)
    .sort((a,b)=>Number(a.row[2])-Number(b.row[2])||a.index-b.index)[0]!.row);
}
export function summaryOracle(rows:unknown[][]):{user_id:string;count:number}[] {
  const retained=dedupeOracle(rows);
  return [...new Set(retained.map(r=>String(r[0])))].sort().map(user_id=>({user_id,count:retained.filter(r=>r[0]===user_id).length}));
}
export function windowOracle(codes:string[],k:number):[number,number] {
  let best:[number,number]=[0,0];
  for(let start=0;start<codes.length;start++)for(let end=start+1;end<=codes.length;end++) {
    if(new Set(codes.slice(start,end)).size<=k && end-start>best[1]-best[0])best=[start,end];
  }
  return best;
}
function reportOracle(codes:string[],k:number) {const [start,end]=windowOracle(codes,k);return {start,end_exclusive:end,length:end-start};}
function rng(seed:number) { let state=seed>>>0; return (max:number)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return Math.floor((state/4294967296)*max);}; }
const equal = (a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const secondReference='def second_largest(nums):\n    largest = None\n    second = None\n    for number in nums:\n        if largest is None or number > largest:\n            second = largest\n            largest = number\n        elif number != largest and (second is None or number > second):\n            second = number\n    return second\n';
function secondTask():PrivateTask {
  const reference={path:'app/summary.py',content:secondReference,editable:true};
  const starter={...reference,content:'def second_largest(nums):\n    return max(nums, default=None)\n'};
  const inputs=[[1,2,3],[-2,-2,-5],[],[7],[3,3,1],[0,-1,0],[-9,-4,-6],[5,2,5,2]];
  const tests=(['visible','hidden'] as const).map((visibility,index)=>{
    const selected=inputs.slice(index*4,index*4+4);const path=`tests/test_${visibility}.py`;
    const names=selected.map((_,i)=>`test_case_${index*4+i}`);
    return {path,visibility,ids:names.map(n=>`${path}::${n}`),content:renderTests('app.summary','second_largest',selected.map((args,i)=>({c:{args:[args],kwargs:{},visibility},outcome:value(secondLargestOracle(args)),name:names[i]!})))};
  });
  const f2p:string[]=[],p2p:string[]=[];
  inputs.forEach((input,i)=>{const buggy=input.length?Math.max(...input):null;const id=tests[Math.floor(i/4)]!.ids[i%4]!;(buggy===secondLargestOracle(input)?p2p:f2p).push(id);});
  return {task_id:'seed-second-largest',tier:'novice',domain:'backend',language:'python',task_type:'bug_fix',source:'seed_bank',title:'Second-largest distinct integer',statement_md:'Return the second-largest DISTINCT integer in nums, or None when fewer than two distinct integers exist. For [1, 2, 3], return 2. Only app/summary.py is editable.',dsa_topics:['arrays'],files:[starter],reference_files:[reference],tests,visible_tests:tests[0]!.ids.map(id=>({id,path:tests[0]!.path,content:tests[0]!.content})),f2p_ids:f2p,p2p_ids:p2p,hint_ladder:['Consider repeated values and the empty input.','Trace how the result changes when a new largest value arrives.','Track two distinct ranks rather than just one extremum.'],limits:{wall_time_ms:5000,memory_mb:128,cpu_count:1,pids:32,output_bytes:65536}};
}
const CONTEXT:Record<Domain,string>={backend:'a backend service',web:'a web application',security:'a security monitoring service',ml:'a deterministic data-analysis pipeline'};
const SCENARIO:Record<ScenarioId,string>={operations:'operational reporting',reliability:'reliability monitoring',analytics:'batch analytics'};
export const SCENARIOS=Object.freeze(Object.keys(SCENARIO) as ScenarioId[]);
export function statement(family:Family,domain:Domain,scenario:ScenarioId):string {
  return `Context: ${SCENARIO[scenario]} for ${CONTEXT[domain]}. This task uses Python, regardless of the portfolio's framework.\n\n${family.contract}\n\nVerified examples:\n`+family.examples.map((e,i)=>`${i+1}. ${e.func}(${e.args.map(pyLiteral).join(', ')}) returns ${e.outcome.kind==='value'?pyLiteral(e.outcome.value):e.outcome.exception}.`).join('\n');
}
export function familyTask(family:Family,domain:Domain,scenario:ScenarioId='operations'):PrivateTask {
  return {...structuredClone(family.base),...gradingForFamily(family),family_id:family.id,domain,statement_md:statement(family,domain,scenario)};
}
export function matchesContract(task:PrivateTask,family:Family):boolean {
  // Exact legacy reviewed statements remain accepted for existing seed snapshots.
  return (task.title===family.base.title&&task.statement_md===family.base.statement_md)
    || (task.title===family.base.title&&SCENARIOS.some(s=>task.statement_md===statement(family,task.domain,s)));
}
export function sameFiles(a:PrivateTask['files'],b:PrivateTask['files']):boolean {
  const sorted=(files:PrivateTask['files'])=>[...files].sort((x,y)=>x.path.localeCompare(y.path));
  return equal(sorted(a),sorted(b));
}
function sameGrading(task:PrivateTask,expected:Pick<PrivateTask,'tests'|'visible_tests'|'f2p_ids'|'p2p_ids'>):boolean {
  return equal(task.tests,expected.tests)&&equal(task.visible_tests,expected.visible_tests)
    &&equal(task.f2p_ids,expected.f2p_ids)&&equal(task.p2p_ids,expected.p2p_ids);
}
// Expected values below come exclusively from the independent TypeScript oracles.
// Starter classification describes only the reviewed, pinned starter variants.
export function gradingForFamily(family:Family):Pick<PrivateTask,'tests'|'visible_tests'|'f2p_ids'|'p2p_ids'> {
  const f2p_ids:string[]=[],p2p_ids:string[]=[];
  const starterPass=(c:OracleCase)=>{
    if(family.id==='request_peak_v1')return equal(value(peakOracle((c.args[0] as number[]).slice(0,-1))),c.outcome);
    if(family.id==='second_largest_v1'){const nums=c.args[0] as number[];return equal(value(nums.length?Math.max(...nums):null),c.outcome);}
    if(family.id==='event_dedupe_v1')return c.func==='normalize_batch';
    return c.func!=='build_report'||(c.outcome.kind==='value'&&(c.outcome.value as {length:number}).length===0);
  };
  const tests=(['visible','hidden'] as const).map(visibility=>{
    const selected=family.cases.map((c,i)=>({c,i})).filter(({i})=>(i<6?'visible':'hidden')===visibility);
    const path=`tests/test_${visibility}.py`;
    const ids:string[]=[];
    let content=selected.map(({c,i})=>{
      const name=`test_family_${i}`,id=`${path}::${name}`;ids.push(id);(starterPass(c)?p2p_ids:f2p_ids).push(id);
      return renderTests(c.module,c.func,[{c:{args:c.args,kwargs:{},visibility},outcome:c.outcome,name}]);
    }).join('\n');
    if(visibility==='hidden'&&family.performanceIds.length){
      const id=family.performanceIds[0]!;ids.push(id);f2p_ids.push(id);
      content+='\nimport time\nfrom app.window import longest_window\ndef test_large_window_performance():\n    codes = ["A"] * 30000\n    started = time.perf_counter()\n    result = longest_window(codes, 1)\n    assert result == (0, 30000)\n    assert time.perf_counter() - started < 0.3\n';
    }
    return {path,visibility,ids,content};
  });
  return {tests,visible_tests:tests[0]!.ids.map(id=>({id,path:tests[0]!.path,content:tests[0]!.content})),f2p_ids,p2p_ids};
}
export function trustedGrading(task:PrivateTask,family:Family):boolean {
  return equal(task.limits,family.base.limits)&&(sameGrading(task,family.base)||sameGrading(task,gradingForFamily(family)));
}
export function oracleTestFile(family:Family):TestFile {
  const path='tests/test_independent_oracle.py';
  return {path,visibility:'hidden',ids:family.cases.map((_,i)=>`${path}::test_oracle_${i}`),
    content:family.cases.map((c,i)=>renderTests(c.module,c.func,[{c:{args:c.args,kwargs:{},visibility:'hidden'},outcome:c.outcome,name:`test_oracle_${i}`}])).join('\n')};
}
let registry:Promise<Family[]>|undefined;
export async function families():Promise<Family[]> {
  registry??=buildFamilies();
  // Never hand mutable registry state to a caller.
  return structuredClone(await registry);
}
export async function resolveFamily(task:PrivateTask):Promise<Family|undefined> {
  return (await families()).find(f=>task.family_id ? f.id===task.family_id : f.base.task_id===task.task_id);
}
async function buildFamilies():Promise<Family[]> {
  const bank=await loadSeedBank();
  const peak=bank.novice?.[0],dedupe=bank.adept?.[0],window=bank.master?.[0];
  if(!peak||!dedupe||!window)throw Error('Reviewed family artifacts unavailable');
  const second=secondTask();
  const defs:Family[]=[
    {id:'request_peak_v1',base:peak,contract:'Implement peak_requests(counts) in app/summary.py. counts is a list of nonnegative integers, length at most 30000. Return the largest count; an empty list returns 0. Do not mutate counts. Only app/summary.py is editable.',examples:[example('app.summary','peak_requests',[[2,7,3]],7),example('app.summary','peak_requests',[[2,3,9]],9)],cases:[],performanceIds:[]},
    {id:'second_largest_v1',base:second,contract:second.statement_md+' nums is a list of integers with length at most 30000. Duplicates do not create another rank. Negative values are allowed. Do not mutate nums.',examples:[example('app.summary','second_largest',[[1,2,3]],2),example('app.summary','second_largest',[[-2,-2,-5]],-5),example('app.summary','second_largest',[[]],null)],cases:[],performanceIds:[]},
    {id:'event_dedupe_v1',base:dedupe,contract:'Implement the missing feature across app/store.py and app/service.py; app/models.py is read-only. rows is a list of three-item sequences (user_id, event_id, ts). Both IDs are nonempty, case-sensitive strings; ts is a nonnegative integer excluding bool. Invalid field values raise ValueError. IDs are global across users. Retain the smallest timestamp per event ID, choosing the first input occurrence on ties, in first-seen event-ID order. deduplicate(rows) returns retained tuples; summarize_events(rows) returns {user_id, count} dictionaries ordered lexicographically by user_id. Empty input returns []. Preserve normalize_batch validation and row order. Use the provided arrays/hashing implementation; only sorted dictionary keys determine output order.',examples:[example('app.service','summarize_events',[[['bob','b1',5],['amy','a1',8],['bob','b1',3],['amy','a2',9]]],[{user_id:'amy',count:2},{user_id:'bob',count:1}]),example('app.store','deduplicate',[[['z','shared',10],['a','shared',2],['b','shared',2],['b','other',1]]],[tuple(['a','shared',2]),tuple(['b','other',1])])],cases:[],performanceIds:[]},
    {id:'session_window_v1',base:window,contract:'Repair app/window.py and app/report.py; app/parser.py is read-only. parse_codes(lines) strips whitespace, ignores blank lines and accepts exactly request_id|error_code with nonempty fields; malformed strings raise ValueError. IDs are not deduplicated. longest_window(codes,k) returns (start,end_exclusive) for the longest contiguous span containing at most k distinct case-sensitive codes. Choose the earliest start on ties. k is an integer: negative values raise ValueError; k=0 or empty input returns (0,0). build_report(lines,k) returns {start,end_exclusive,length:end-start} in parsed-record offsets. Do not mutate inputs. Support 30000 records; the trusted performance test requires the window call to finish in 0.3 seconds on the runner. This is a measured workload constraint, not a proof of asymptotic complexity.',examples:[example('app.report','build_report',[['r1|A','r2|B','r3|A','r4|C','r5|C'],2],{start:0,end_exclusive:3,length:3}),example('app.report','build_report',[['r1|A','r2|B','r3|C','r4|C','r5|B','r6|B','r7|A'],2],{start:1,end_exclusive:6,length:5})],cases:[],performanceIds:['tests/test_hidden.py::test_large_window_performance']},
  ];
  const random=rng(360731);
  for(const f of defs) {
    const add=(module:string,func:string,args:unknown[],outcome:Outcome)=>f.cases.push({module,func,args,outcome});
    if(f.id==='request_peak_v1'||f.id==='second_largest_v1') {
      const inputs:number[][]=[[],[0],[7,7],[1,2,3],[3,2,1],[2,9,9,1]];
      for(let i=0;i<32;i++)inputs.push(Array.from({length:random(20)},()=>random(31)-(f.id==='second_largest_v1'?15:0)));
      for(const nums of inputs)add('app.summary',f.id==='request_peak_v1'?'peak_requests':'second_largest',[nums],value(f.id==='request_peak_v1'?peakOracle(nums):secondLargestOracle(nums)));
    } else if(f.id==='event_dedupe_v1') {
      const inputs:unknown[][][]=[[],[['a','same',2],['b','same',1],['c','same',1]], [['Z','e2',0],['a','e1',0],['a','e2',0]]];
      for(let i=0;i<24;i++)inputs.push(Array.from({length:random(15)},()=>[String.fromCharCode(65+random(4)),`e${random(5)}`,random(5)]));
      for(const rows of inputs){add('app.store','deduplicate',[rows],value(dedupeOracle(rows).map(tuple)));add('app.service','summarize_events',[rows],value(summaryOracle(rows)));add('app.models','normalize_batch',[rows],value(rows.map(tuple)));}
      for(const rows of [[['a','',1]],[['a','x',-1]],[['a','x',true]],[['','x',0]]])add('app.models','normalize_batch',[rows],raises);
    } else {
      const inputs:{codes:string[];k:number}[]=[{codes:[],k:2},{codes:['A'],k:0},{codes:['A','B','A','C','C'],k:2},{codes:['A','B','C','C','B','B','A'],k:2}];
      for(let i=0;i<32;i++)inputs.push({codes:Array.from({length:random(20)},()=>String.fromCharCode(65+random(4))),k:random(5)});
      for(const {codes,k} of inputs){add('app.window','longest_window',[codes,k],value(tuple(windowOracle(codes,k))));add('app.report','build_report',[codes.map((c,i)=>`r${i}|${c}`),k],value(reportOracle(codes,k)));}
      add('app.window','longest_window',[['A'],-1],raises);add('app.parser','parse_codes',[[' ',' r1 | TIMEOUT ','r2|DENIED']],value(['TIMEOUT','DENIED']));
      for(const line of ['missing','r|A|B','|A','r| '])add('app.parser','parse_codes',[[line]],raises);
    }
    // Hand-derived anchors independently constrain the oracle implementations too.
    for(const e of f.examples) {
      let expected:unknown;
      if(f.id==='request_peak_v1')expected=peakOracle(e.args[0] as number[]);
      else if(f.id==='second_largest_v1')expected=secondLargestOracle(e.args[0] as number[]);
      else if(f.id==='event_dedupe_v1')expected=e.func==='deduplicate'?dedupeOracle(e.args[0] as unknown[][]).map(tuple):summaryOracle(e.args[0] as unknown[][]);
      else {const lines=e.args[0] as string[];expected=reportOracle(lines.map(l=>l.split('|')[1]!),e.args[1] as number);}
      if(!equal(value(expected),e.outcome))throw Error('Trusted example contradicts independent oracle');
    }
    f.cases.push(...f.examples);
  }
  return defs;
}
