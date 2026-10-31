import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Value from 'typebox/value';
import { Task } from '@torquecode/contracts';
import type { File, Gate, PrivateTask, Topic, ValidationReceipt, InternalRunResult } from '../contracts/internal.js';
import type { Ports } from '../contracts/seams.js';
import { publicTask } from '../api/public-projections.js';
import { validateRequest } from '../runner/dockerRunner.js';
import { resolveFamily, matchesContract, trustedGrading, oracleTestFile, sameFiles } from './families.js';
import { checkOutput, solutionFingerprint, STANDARD_POLICY } from '../llm/guards.js';

type Scan = { errors: string[]; unclaimed?: string[]; format_errors?: string[] };

function scanner(name: string, files: File[], topics: Topic[], signal: AbortSignal): Promise<Scan> {
  return new Promise((resolve, reject) => {
    const file = fileURLToPath(new URL(`../tools/${name}`, import.meta.url));
    const child = spawn(process.env.TORQUECODE_PYTHON || 'python3', [file], {
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      env: { PATH: process.env.PATH || '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' },
    });
    let output = '';
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('Static analysis unavailable'));
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (part: string) => {
      output += part;
      if (output.length > 131072) fail();
    });
    child.stderr.resume();
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) return fail();
      try {
        const value: unknown = JSON.parse(output);
        if (!value || typeof value !== 'object' || !('errors' in value) ||
            !Array.isArray(value.errors)) return fail();
        settled = true;
        resolve(value as Scan);
      } catch { fail(); }
    });
    child.stdin.end(JSON.stringify({ files, claimed_topics: topics }));
  });
}

function validStructure(task: PrivateTask): boolean {
  try {
    if (!Value.Check(Task, publicTask(task)) || task.language !== 'python') return false;
    if (task.hint_ladder.length !== 3 || task.hint_ladder.some(h => !h.trim())) return false;
    if (!task.reference_files.length || task.reference_files.length !== task.files.length) return false;
    if (!task.tests.length || !task.f2p_ids.length) return false;

    const allIds = task.tests.flatMap(t => t.ids);
    const classified = [...task.f2p_ids, ...task.p2p_ids];
    if (!allIds.length || new Set(allIds).size !== allIds.length ||
        classified.length !== allIds.length ||
        new Set(classified).size !== classified.length ||
        classified.some(id => !allIds.includes(id))) return false;

    for (const file of task.files) {
      const reference = task.reference_files.find(f => f.path === file.path);
      if (!reference || reference.editable !== file.editable) return false;
      if (!file.editable && reference.content !== file.content) return false;
    }
    if (!task.files.some(f => f.editable)) return false;

    const visible = task.tests.filter(t => t.visibility === 'visible');
    const ids = visible.flatMap(t => t.ids);
    if (!ids.length || ids.length !== task.visible_tests.length) return false;
    if (task.visible_tests.some(t => !visible.some(v =>
      v.path === t.path && v.content === t.content && v.ids.includes(t.id)))) return false;

    const request = (files: File[]) => ({
      task_id: task.task_id, files, tests: task.tests,
      limits: task.limits, mode: 'submit' as const,
    });
    return validateRequest(request(task.files)) === null &&
      validateRequest(request(task.reference_files)) === null;
  } catch { return false; }
}

function leakFree(task: PrivateTask): boolean {
  const normalize = (code: string) =>
    code.split('\n').map(line => line.replace(/#.*$/, '').replace(/\s+/g, ''))
      .join('');

  const starter = task.files.filter(f => f.editable).map(f => normalize(f.content)).join('|');
  const reference = task.reference_files.filter(f => f.editable)
    .map(f => normalize(f.content)).join('|');

  if (starter === reference) return false;

  const fingerprint = solutionFingerprint(task.reference_files, task.files);
  return task.hint_ladder.every(h => checkOutput(h, {
    files: task.files, fingerprint, policy: STANDARD_POLICY,
  }).ok);
}

function complete(result: InternalRunResult, task: PrivateTask): boolean {
  const expected = task.tests.flatMap(t => t.ids);
  const actual = result.tests.map(t => t.id);
  return result.mode === 'submit' && result.task_id === task.task_id &&
    !result.timed_out && result.total === expected.length &&
    actual.length === expected.length &&
    new Set(actual).size === expected.length &&
    expected.every(id => actual.includes(id)) &&
    result.passed === result.tests.filter(t => t.status === 'pass').length;
}

export function createValidationEngine(runTests: Ports['runTests']): Ports['validateTask'] {
  return async ({task,claimed_topics},context) => {
    context.signal.throwIfAborted();
    const gates:Gate[]=[];
    const add=(gate:Gate['gate'],status:Gate['status'],reason:string)=>gates.push({gate,status,reason});
    const skip=(reason:string,names:Gate['gate'][])=>{for(const name of names)add(name,'skipped',reason);};
    let family:Awaited<ReturnType<typeof resolveFamily>>;
    const done=()=>{
      const passed=(name:Gate['gate'])=>gates.find(g=>g.gate===name)?.status==='pass';
      const structural_valid=gates.filter(g=>g.gate!=='differential').every(g=>g.status==='pass'||g.status==='not_applicable') && gates.length===10;
      const semantic_verified=!!family&&passed('differential')&&passed('examples')&&passed('topics')&&passed('format')&&passed('reference');
      return {kind:'ok' as const,value:{task_id:task.task_id,valid:structural_valid&&semantic_verified,structural_valid,semantic_verified,...(family?{family_id:family.id}:{}),gates} satisfies ValidationReceipt};
    };
    if(!validStructure(task)){
      add('schema','fail','Invalid task structure or trusted test manifest');
      skip('Schema validation failed',['topics','imports','format','examples','leakage','reference','starter','differential','performance']);
      return done();
    }
    add('schema','pass','Complete task and test manifest');
    try {family=await resolveFamily(task);}catch{ /* registry failure is unverified, never a pass */ }
    if(!family){
      skip('No supported trusted task family; independent correctness is unverified',['topics','imports','format','examples','leakage','reference','starter','differential','performance']);
      return done();
    }
    let topics:Scan,imports:Scan;
    try{
      [topics,imports]=await Promise.all([
        scanner('topic_scan.py',task.reference_files,claimed_topics,context.signal),
        scanner('import_check.py',[...task.files,...task.reference_files,...task.tests.map(t=>({path:t.path,content:t.content,editable:false}))],claimed_topics,context.signal),
      ]);
    }catch{
      add('topics','fail','Static scanner unavailable');add('imports','fail','Static scanner unavailable');
      skip('Static analysis incomplete',['format','examples','leakage','reference','starter','differential','performance']);return done();
    }
    const sameTopics=JSON.stringify([...task.dsa_topics].sort())===JSON.stringify([...family.base.dsa_topics].sort());
    const topicOK=sameTopics&&task.tier===family.base.tier&&task.task_type===family.base.task_type&&task.dsa_topics.every(t=>claimed_topics.includes(t))&&!topics.errors.length&&!topics.unclaimed?.length;
    add('topics',topicOK?'pass':'fail',topicOK?'Trusted family topics are claimed; implementation provenance checked below':'Family topics, task type or allowed constructs do not match candidate claims');
    add('imports',imports.errors.length?'fail':'pass',imports.errors.length?'Disallowed imports or code execution':'Imports allowed');
    const trusted=trustedGrading(task,family);
    const formatOK=trusted&&!imports.format_errors?.length;
    add('format',formatOK?'pass':'fail',formatOK?'Grading tests exactly match the server-owned family template':'Test provenance or supported runner format rejected; caller tests will not execute');
    const contractOK=matchesContract(task,family);
    add('examples',contractOK?'pass':'fail',contractOK?'Pinned contract and structured examples agree with independent oracle':'Statement or example differs from the pinned family contract');
    const noLeak=leakFree(task);
    add('leakage',noLeak?'pass':'fail',noLeak?'No detected solution-code leakage; prose hints remain heuristic':'Starter or hints expose reference logic');
    if(!topicOK||imports.errors.length||imports.format_errors?.length||!contractOK||!noLeak){
      skip('Task contract or safety validation failed',['reference','starter','differential','performance']);return done();
    }
    const independent=oracleTestFile(family);
    const selected=trusted?[...task.tests,independent]:[independent];
    const expected=new Map(selected.flatMap(t=>t.ids.map(id=>[id,t.visibility] as const)));
    const oracleIds=new Set(independent.ids);
    const execute=async(files:File[],tests:PrivateTask['tests'])=>{
      try{return await runTests({task_id:task.task_id,files,tests,mode:'submit',limits:{...family!.base.limits}},context);}
      catch{context.signal.throwIfAborted();return {kind:'unavailable' as const,code:'SANDBOX_UNAVAILABLE' as const,message:'Trusted runner unavailable'};}
    };
    const verified:InternalRunResult[]=[];
    let oraclePass=true,referencePass=trusted;
    for(let i=0;i<3;i++){
      const run=await execute(task.reference_files,selected);
      if(run.kind!=='ok'){
        if(run.kind==='unavailable'&&/not supported/i.test(run.message)){
          const format=gates.find(g=>g.gate==='format')!;format.status='fail';format.reason='Unsupported isolated-runner task format';
        }
        add('reference',run.kind==='unavailable'?'skipped':'fail','Reference execution not verified');
        skip('Independent reference execution unavailable',['starter','differential','performance']);return done();
      }
      const result=run.value;
      const completeRun=complete(result,{...task,tests:selected})&&result.tests.every(t=>expected.get(t.id)===t.visibility&&['pass','fail','error','timeout'].includes(t.status)&&Number.isFinite(t.duration_ms)&&t.duration_ms>=0);
      if(!completeRun){add('reference','fail','Incomplete or invalid trusted runner evidence');skip('Runner evidence rejected',['starter','differential','performance']);return done();}
      oraclePass&&=result.tests.filter(t=>oracleIds.has(t.id)).every(t=>t.status==='pass');
      referencePass&&=result.tests.every(t=>t.status==='pass');
      verified.push(result);
      if(!oraclePass||!referencePass)break;
    }
    const knownReference=sameFiles(task.reference_files,family.base.reference_files);
    if(!knownReference){const topic=gates.find(g=>g.gate==='topics')!;topic.status='fail';topic.reason='Reference implementation is outside the reviewed family; algorithm-topic coverage is not established';}
    add('reference',referencePass&&verified.length===3?'pass':'fail',referencePass&&verified.length===3?'Reference passed trusted grading and oracle assertions in three runs':'Reference failed trusted tests or caller-test provenance was rejected');
    add('differential',oraclePass&&verified.length===3?'pass':'fail',oraclePass&&verified.length===3?`Reference matched independent oracle on ${independent.ids.length} fixed and seeded-random cases in three isolated runs`:'Reference disagrees with independent oracle or repeated verification is incomplete');
    if(!referencePass||!oraclePass||!knownReference||!formatOK){skip('Reference not eligible for release',['starter','performance']);return done();}
    const starter=await execute(task.files,task.tests);
    if(starter.kind!=='ok'||!complete(starter.value,task)){
      add('starter',starter.kind==='unavailable'?'skipped':'fail','Starter execution not verified');skip('Starter not verified',['performance']);return done();
    }
    const statuses=new Map(starter.value.tests.map(t=>[t.id,t.status]));
    const starterOK=task.f2p_ids.every(id=>statuses.get(id)==='fail')&&task.p2p_ids.every(id=>statuses.get(id)==='pass');
    add('starter',starterOK?'pass':'fail',starterOK?'Starter F2P/P2P verified against the trusted family answer key':'Starter outcomes contradict the trusted family manifest');
    if(!family.performanceIds.length)add('performance','not_applicable','This family has no performance requirement');
    else {
      const perfOK=family.performanceIds.every(id=>verified.every(r=>r.tests.find(t=>t.id===id)?.status==='pass')&&statuses.get(id)==='fail');
      add('performance',perfOK?'pass':'fail',perfOK?'Pinned workload and elapsed-time assertion passed for the reference and failed for the starter; no asymptotic proof is claimed':'Trusted family performance workload was not verified');
    }
    return done();
  };
}
