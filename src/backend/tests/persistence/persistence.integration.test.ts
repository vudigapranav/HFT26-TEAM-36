import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../api/app.js';
import { createWiredPorts } from '../../api/wiring.js';
import { loadSeedBank } from '../../api/seed-bank.js';
import { PostgresAssessmentStore } from '../../api/postgres-assessment-store.js';
import { readAuthUser } from '../../api/auth.js';
import { migrate } from '../../api/db/migrate.js';
import { readConfig } from '../../api/config.js';
import type { Ports } from '../../contracts/seams.js';

// Test-only validation double: persistence is isolated from grading; real oracle verification is covered by generation suites.
const certifiedFixture: Ports['validateTask'] = async ({task}) => ({kind:'ok',value:{task_id:task.task_id,valid:true,structural_valid:true,semantic_verified:true,family_id:task.family_id??'persistence-fixture',gates:[{gate:'differential',status:'pass',reason:'Test-only certificate double'}]}});
import { checkResponseContract } from '../helpers/response-contract.js';

const enabled = process.env.TORQUECODE_ISOLATED_TEST_DB === '1';
describe.skipIf(!enabled)('K11 real PostgreSQL durability', () => {
 const pool = new Pool({connectionString:process.env.DATABASE_URL,max:8});
 const origin = 'http://127.0.0.1:3001';
 const auth = {pool,origin,secure:false};
 const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
 let bank: Awaited<ReturnType<typeof loadSeedBank>>;
 let portfolio: object;
 let app: Awaited<ReturnType<typeof buildApp>>;
 // These integration tests isolate persistence from Docker/paid provider availability.
 const runTests:Ports['runTests'] = async input => {
  const tests = input.tests.filter(t=>input.mode==='submit'||t.visibility==='visible').flatMap(t=>t.ids.map(id=>({id,status:'pass' as const,visibility:t.visibility,duration_ms:1})));
  return {kind:'ok',value:{run_id:randomUUID(),task_id:input.task_id,mode:input.mode,tests,passed:tests.length,total:tests.length,stdout:'visible only',stderr:'',timed_out:false}};
 };
 const chat:Ports['chat'] = async () => ({kind:'ok',value:{content:'Trace the retained event count after each operation.',model:'test'}});
 async function start(overrides:Partial<Ports>={},trust_proxy=false,generation_timeout_ms=120000) {
  const seed=bank.novice![0]!;
  const created=await buildApp({ports:createWiredPorts(seed,{runTests,chat,validateTask:certifiedFixture,...overrides}),auth,trust_proxy,assessment:{store:new PostgresAssessmentStore(pool),generation_timeout_ms,seed,seed_bank:bank,origin,runner:'isolated',authenticate:async req=>(await readAuthUser(req,auth))?.user_id}});
  await created.ready(); apps.push(created); return created;
 }
 const call=async(method:'GET'|'POST'|'PUT',url:string,cookie?:string,payload?:object) => {
  const response=await app.inject({method,url,headers:{origin,...(cookie?{cookie}:{})},...(payload?{payload}:{})});
  checkResponseContract(method,url,response); return response;
 };
 async function account(email='candidate@example.org') {
  const creds={email,password:'test correct horse battery staple'};
  expect((await call('POST','/auth/register',undefined,creds)).statusCode).toBe(201);
  const response=await call('POST','/auth/login',undefined,creds);
  expect(response.statusCode).toBe(200);return String(response.headers['set-cookie']).split(';')[0]!;
 }
 async function create(cookie:string,terminal:'ready'|'failed'='ready') {
  expect((await call('POST','/portfolio',cookie,portfolio)).statusCode).toBe(200);
  const quiz=await call('GET','/onboarding-quiz',cookie);
  expect((await call('POST','/onboarding-quiz',cookie,{answers:quiz.json().questions.map((q:{id:string;options:{id:string}[]})=>({question_id:q.id,option_id:q.options[0]!.id}))})).statusCode).toBe(200);
  const response=await call('POST','/assessments',cookie,{});expect(response.statusCode).toBe(201);
  const id=response.json().assessment_id;
  for(let i=0;i<80;i++){
   const status=await call('GET',`/assessments/${id}/status`,cookie);
   if(status.json().generation?.status===terminal)return id;
   await new Promise(r=>setTimeout(r,50));
  }throw new Error('Generation fallback did not finish');
 }
 beforeAll(async()=>{await migrate(pool);await migrate(pool);bank=await loadSeedBank();portfolio=JSON.parse(await readFile(new URL('../../../../docs/demo/demo-portfolio.json',import.meta.url),'utf8'));});
 beforeEach(async()=>{for(const a of apps.splice(0))await a.close();await pool.query('TRUNCATE auth_users,auth_rate_limits CASCADE');app=await start();});
 afterAll(async()=>{for(const a of apps)await a.close();await pool.end();});

 it('retains saved source, grades, unlocks, hints, AI events and reports across app/store restarts',async()=>{
  const cookie=await account();const id=await create(cookie);const base=`/assessments/${id}`;
  const files=bank.novice![0]!.reference_files;
  expect((await call('PUT',`${base}/tasks/question-1/files`,cookie,{files})).statusCode).toBe(200);
  expect((await call('POST',`${base}/tasks/question-1/run`,cookie,{})).statusCode).toBe(200);
  expect((await call('POST',`${base}/tasks/question-1/submit`,cookie,{})).statusCode).toBe(200);
  expect((await call('POST',`${base}/tier/upgrade`,cookie,{})).statusCode).toBe(200);
  expect((await call('POST',`${base}/hint`,cookie,{task_id:'question-2'})).statusCode).toBe(200);
  const reply=await call('POST',`${base}/assistant`,cookie,{task_id:'question-2',message:'Why are duplicate records affecting the count?'});
  expect(reply.statusCode).toBe(200);expect(reply.json().blocked).toBe(false);
  const before=await call('GET',`${base}/status`,cookie);
  const report=await call('GET',`/reports/report-${id}`,cookie);
  await app.close();app=await start();
  expect((await call('GET',`${base}/tasks/question-1`,cookie)).json().files).toEqual(files);
  const after=await call('GET',`${base}/status`,cookie);
  expect(after.json().expires_at).toBe(before.json().expires_at);expect(after.json().unlocks_used).toBe(1);
  expect((await call('GET',`/reports/report-${id}`,cookie)).json()).toEqual(report.json());
  const events=await pool.query('SELECT type FROM events WHERE assessment_id=$1',[id]);
  expect(events.rows.map(e=>e.type)).toEqual(expect.arrayContaining(['assistant_message','hint_served','run','submit']));
  expect((await pool.query('SELECT status,source FROM generation_jobs WHERE assessment_id=$1',[id])).rows[0]).toEqual({status:'ready',source:'seed_bank'});
 });
 it.each(['ready','validating'] as const)('revalidates legacy %s tasks without overwriting saved work',async(status)=>{
  const cookie=await account();const id=await create(cookie);const base=`/assessments/${id}`;
  const files=bank.novice![0]!.reference_files;
  await call('PUT',`${base}/tasks/question-1/files`,cookie,{files});
  await call('POST',`${base}/tasks/question-1/submit`,cookie,{});
  await call('POST',`${base}/tier/upgrade`,cookie,{});
  const before=(await call('GET',`${base}/status`,cookie)).json();
  const runs=(await pool.query('SELECT count(*)::int AS n FROM runs WHERE assessment_id=$1',[id])).rows[0].n;
  await app.close();
  await pool.query("UPDATE generation_jobs SET status=$2,progress=$3::jsonb WHERE assessment_id=$1",[id,status,JSON.stringify(status==='validating'?{revalidate_existing:true}:{})]);
  const forbidden:Ports['generateAssessment']=async()=>{throw Error('Revalidation must not replace existing tasks');};
  app=await start({generateAssessment:forbidden});
  for(let i=0;i<80;i++){
   const after=(await call('GET',`${base}/status`,cookie)).json();
   if(after.generation.status==='ready'){
    expect(after.generation.verification.semantic_verified).toBe(true);
    expect(after.expires_at).toBe(before.expires_at);expect(after.unlocks_used).toBe(before.unlocks_used);
    expect((await call('GET',`${base}/tasks/question-1`,cookie)).json().files).toEqual(files);
    expect((await pool.query('SELECT count(*)::int AS n FROM runs WHERE assessment_id=$1',[id])).rows[0].n).toBe(runs);
    return;
   }
   await new Promise(r=>setTimeout(r,50));
  }throw Error('Legacy task revalidation did not finish');
 });
 it('does not publish unchecked fallback tasks or fabricate a grade from a legacy valid flag',async()=>{
  await app.close();
  app=await start({validateTask:async({task})=>({kind:'ok',value:{task_id:task.task_id,valid:true,gates:[{gate:'reference',status:'pass',reason:'Legacy consistency only'}]}})});
  const cookie=await account();const id=await create(cookie,'failed');const base=`/assessments/${id}`;
  const status=(await call('GET',`${base}/status`,cookie)).json();
  expect(status.available_task_ids).toEqual([]);expect(status.questions).toEqual([]);
  expect(status.generation.verification.semantic_verified).toBe(false);
  expect((await call('GET',`${base}/tasks/question-1`,cookie)).statusCode).toBe(409);
  expect((await call('GET',`/reports/report-${id}`,cookie)).statusCode).toBe(503);
  expect((await pool.query('SELECT count(*)::int AS n FROM runs WHERE assessment_id=$1',[id])).rows[0].n).toBe(0);
  expect((await pool.query('SELECT expired_finalized FROM assessments WHERE id=$1',[id])).rows[0].expired_finalized).toBe(true);
 });
 it('K8 completes all three question sets and retains claims and report across restart',async()=>{
  await app.close();

  // Keep this integration fixture deterministic, independent of paid LLMs.
  const fallback:Ports['generateAssessment']=async()=>({
   kind:'unavailable',
   code:'NOT_IMPLEMENTED',
   message:'K8 deterministic seed-bank fixture',
  });
  app=await start({generateAssessment:fallback});

  // Real cookie authentication, portfolio parsing and quiz.
  const cookie=await account('k8@example.org');
  const uploaded=await call('POST','/portfolio',cookie,portfolio);
  expect(uploaded.statusCode).toBe(200);
  const originalTopics:string[]=uploaded.json().profile.claimed_topics;

  const quiz=await call('GET','/onboarding-quiz',cookie);
  expect(quiz.statusCode).toBe(200);
  const answers=quiz.json().questions.map(
   (q:{id:string;options:{id:string}[]})=>({
    question_id:q.id,option_id:q.options[0]!.id
   })
  );
  expect((await call('POST','/onboarding-quiz',cookie,{answers})).statusCode).toBe(200);

  const created=await call('POST','/assessments',cookie,{});
  expect(created.statusCode).toBe(201);
  const id:string=created.json().assessment_id;
  const base=`/assessments/${id}`;

  let ready:any;
  for(let i=0;i<80;i++){
   const response=await call('GET',`${base}/status`,cookie);
   if(response.json().generation?.status==='ready'){
    ready=response.json();
    break;
   }
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  expect(ready).toBeDefined();
  expect(ready.generation.source).toBe('seed_bank');
  const expiresAt=ready.expires_at;

  // Set 1: autosave, run, and submit every offered question.
  const firstSet:string[]=ready.available_task_ids;
  expect(firstSet.length).toBeGreaterThan(0);
  const editable=bank.novice![0]!.reference_files;

  expect((await call('PUT',
   `${base}/tasks/${firstSet[0]}/files`,
   cookie,{files:editable}
  )).statusCode).toBe(200);

  expect((await call('POST',
   `${base}/tasks/${firstSet[0]}/run`,cookie,{}
  )).statusCode).toBe(200);

  for(const q of firstSet){
   expect((await call('POST',
    `${base}/tasks/${q}/submit`,cookie,{}
   )).statusCode).toBe(200);
  }

  expect((await call('GET',`${base}/status`,cookie))
   .json().unlock_available).toBe(true);

  // Unlock Set 2 and use the guarded assistant and hint.
  const secondUnlock=await call('POST',`${base}/tier/upgrade`,cookie,{});
  expect(secondUnlock.statusCode).toBe(200);
  expect(secondUnlock.json().unlocks_used).toBe(1);

  const firstIds=new Set(firstSet);
  const secondSet:string[]=secondUnlock.json()
   .available_task_ids.filter((q:string)=>!firstIds.has(q));
  expect(secondSet.length).toBeGreaterThan(0);

  const hint=await call('POST',`${base}/hint`,cookie,{
   task_id:secondSet[0]
  });
  expect(hint.statusCode).toBe(200);

  const assistant=await call('POST',`${base}/assistant`,cookie,{
   task_id:secondSet[0],
   message:'What should I inspect when debugging duplicate counts?'
  });
  expect(assistant.statusCode).toBe(200);
  expect(assistant.json().blocked).toBe(false);

  for(const q of secondSet){
   expect((await call('POST',
    `${base}/tasks/${q}/submit`,cookie,{}
   )).statusCode).toBe(200);
  }

  // Unlock and submit Set 3.
  const thirdUnlock=await call('POST',`${base}/tier/upgrade`,cookie,{});
  expect(thirdUnlock.statusCode).toBe(200);
  expect(thirdUnlock.json().unlocks_used).toBe(2);
  expect(thirdUnlock.json().expires_at).toBe(expiresAt);

  const previous=new Set([...firstSet,...secondSet]);
  const thirdSet:string[]=thirdUnlock.json()
   .available_task_ids.filter((q:string)=>!previous.has(q));
  expect(thirdSet.length).toBeGreaterThan(0);

  for(const q of thirdSet){
   expect((await call('POST',
    `${base}/tasks/${q}/submit`,cookie,{}
   )).statusCode).toBe(200);
  }

  expect((await call('POST',
   `${base}/tier/upgrade`,cookie,{}
  )).statusCode).toBe(409);

  // A later portfolio must not rewrite assessment-time claims.
  const changed=await call('POST','/portfolio',cookie,{
   ...(portfolio as object),
   dsa_topics_solved:['graphs']
  });
  expect(changed.statusCode).toBe(200);

  const reportPath=`/reports/report-${id}`;
  const before=await call('GET',reportPath,cookie);
  expect(before.statusCode).toBe(200);
  const report=before.json();
  expect(report.tasks.length).toBeGreaterThanOrEqual(3);
  expect(report.claims.map((c:{topic:string})=>c.topic))
   .toEqual(originalTopics);
  expect(report.final_score).toEqual(expect.any(Number));

  // Restart the backend against the SAME PostgreSQL database.
  await app.close();
  app=await start({generateAssessment:fallback});

  const status=await call('GET',`${base}/status`,cookie);
  expect(status.json()).toMatchObject({
   status:'active',
   unlocks_used:2,
   expires_at:expiresAt
  });

  const after=await call('GET',reportPath,cookie);
  expect(after.statusCode).toBe(200);
  expect(after.json()).toEqual(report);

  const evidence=await pool.query(
   'SELECT type FROM events WHERE assessment_id=$1',[id]
  );
  const types:string[]=evidence.rows.map(r=>r.type);
  expect(types.filter(t=>t==='tier_unlocked')).toHaveLength(2);
  expect(types).toEqual(expect.arrayContaining([
   'run','submit','hint_served','assistant_message'
  ]));
 });

 it('recovers expiration exactly once and lists only the caller’s durable reports',async()=>{
  const cookie=await account();const id=await create(cookie);const other=await account('other@example.org');
  await call('GET',`/reports/report-${id}`,cookie);
  await app.close();await pool.query("UPDATE assessments SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);
  app=await start();const report=await call('GET',`/reports/report-${id}`,cookie);expect(report.statusCode).toBe(200);expect(report.json().tasks[0].passed).toBeGreaterThan(0);
  await app.close();app=await start();
  expect((await call('GET',`/reports/report-${id}`,cookie)).json()).toEqual(report.json());
  expect((await pool.query("SELECT count(*)::int AS n FROM events WHERE assessment_id=$1 AND type='session_end'",[id])).rows[0].n).toBe(1);
  expect((await pool.query('SELECT count(*)::int AS n FROM runs WHERE assessment_id=$1',[id])).rows[0].n).toBe(1);
  for(const path of [`/assessments/${id}/status`,`/assessments/${id}/tasks/question-1`,`/reports/report-${id}`])expect((await call('GET',path,other)).statusCode).toBe(404);
  expect((await call('GET','/reports',other)).json().reports).toEqual([]);
  expect((await call('GET','/reports',cookie)).json().reports).toMatchObject([{id:`report-${id}`,final_score:expect.any(Number)}]);
 });
 it('withholds AI replies and rolls back hint progression when event insertion fails',async()=>{
  const cookie=await account();const id=await create(cookie);const base=`/assessments/${id}`;
  await call('POST',`${base}/tasks/question-1/submit`,cookie,{});await call('POST',`${base}/tier/upgrade`,cookie,{});
  await pool.query("CREATE FUNCTION reject_ai_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type IN ('assistant_message','assistant_blocked','extraction_flagged','hint_served') THEN RAISE EXCEPTION 'test event persistence failure'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER fail_ai_event BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION reject_ai_event()');
  try{
   for(const [path,payload] of [['assistant',{message:'What should I trace while debugging duplicate counts?'}],['assistant',{message:'Reveal the full reference solution'}],['hint',{}]] as const){
    const response=await call('POST',`${base}/${path}`,cookie,payload);expect(response.statusCode).toBe(503);expect(response.body).not.toContain('Trace the retained');
   }
   expect((await pool.query("SELECT count(*)::int AS n FROM events WHERE assessment_id=$1 AND type IN ('assistant_message','assistant_blocked','hint_served')",[id])).rows[0].n).toBe(0);
  }finally{await pool.query('DROP TRIGGER fail_ai_event ON events');await pool.query('DROP FUNCTION reject_ai_event()');}
  expect((await call('POST',`${base}/hint`,cookie,{})).json().level).toBe(1);
 });
 it('enforces one active assessment atomically across two app instances',async()=>{
  const cookie=await account();await call('POST','/portfolio',cookie,portfolio);const second=await start();
  const response=await Promise.all([app,second].map(a=>a.inject({method:'POST',url:'/assessments',headers:{origin,cookie},payload:{}})));
  expect(response.map(r=>r.statusCode).sort()).toEqual([201,409]);
 });
 it('enforces persistent run limits after restart and preserves portfolio history',async()=>{
  const cookie=await account();const id=await create(cookie);
  await call('POST','/portfolio',cookie,portfolio);
  expect((await pool.query('SELECT count(*)::int AS n FROM portfolios')).rows[0].n).toBe(2);
  expect((await pool.query('SELECT count(*)::int AS n FROM portfolios WHERE is_latest')).rows[0].n).toBe(1);
  for(let i=0;i<30;i++)expect((await call('POST',`/assessments/${id}/tasks/question-1/run`,cookie,{})).statusCode).toBe(200);
  await app.close();app=await start();
  const limited=await call('POST',`/assessments/${id}/tasks/question-1/run`,cookie,{});
  expect(limited.statusCode).toBe(429);expect(limited.json().error.code).toBe('RUN_RATE_LIMIT');
 });
 it('recovers interrupted generation and falls back on a bounded timeout',async()=>{
  await app.close();
  const stalled:Ports['generateAssessment']=async()=>new Promise(()=>{});
  app=await start({generateAssessment:stalled},false,30);
  const cookie=await account();const id=await create(cookie);
  expect((await call('GET',`/assessments/${id}/status`,cookie)).json().generation).toMatchObject({status:'ready',source:'seed_bank'});
  await app.close();await pool.query("UPDATE generation_jobs SET status='generating' WHERE assessment_id=$1",[id]);
  app=await start();
  for(let i=0;i<80;i++){
   const response=await call('GET',`/assessments/${id}/status`,cookie);
   if(response.json().generation.status==='ready')return;
   await new Promise(r=>setTimeout(r,50));
  }throw new Error('Interrupted generation did not recover');
 });
 it('survives terminating and relaunching an actual backend process',async()=>{
  await app.close();let child:ChildProcess|undefined;
  const launch=async()=>{
   child=fork(fileURLToPath(new URL('../fixtures/persistence/server.ts',import.meta.url)),[],{execArgv:['--import','tsx'],env:process.env,stdio:['ignore','ignore','inherit','ipc']});
   const address=await new Promise<string>((resolve,reject)=>{
    child!.once('message',(message)=>resolve((message as {address:string}).address));
    child!.once('error',reject);child!.once('exit',code=>reject(new Error(`Backend exited before readiness: ${code}`)));
   });return address;
  };
  const stop=async()=>{if(!child || child.exitCode!==null)return;const stopped=new Promise<void>(resolve=>child!.once('exit',()=>resolve()));child.kill('SIGTERM');await stopped;};
  let address=await launch();let cookie='';
  const http=async(method:string,path:string,payload?:object)=>{
   const response=await fetch(address+path,{method,headers:{origin,...(cookie?{cookie}:{}),...(payload?{'content-type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
   expect(response.status).toBeLessThan(400);return response;
  };
  try{
   const creds={email:'process@example.org',password:'test correct horse battery staple'};
   await http('POST','/auth/register',creds);const login=await http('POST','/auth/login',creds);cookie=login.headers.get('set-cookie')!.split(';')[0]!;
   await http('POST','/portfolio',portfolio);const created=await(await http('POST','/assessments',{})).json() as {assessment_id:string};
   const base=`/assessments/${created.assessment_id}`;
   for(let i=0;i<80;i++){
    const status=await(await http('GET',base+'/status')).json() as {generation:{status:string}};
    if(status.generation.status==='ready')break;
    await new Promise(r=>setTimeout(r,50));
   }
   const files=bank.novice![0]!.reference_files;
   await http('PUT',base+'/tasks/question-1/files',{files});await http('POST',base+'/tasks/question-1/run',{});await http('POST',base+'/tasks/question-1/submit',{});
   await http('POST',base+'/tier/upgrade',{});
   await http('POST',base+'/hint',{task_id:'question-2'});
   await http('POST',base+'/assistant',{task_id:'question-2',message:'Why are duplicate records affecting the count?'});
   const status=await(await http('GET',base+'/status')).json() as {expires_at:string};
   const reportPath=`/reports/report-${created.assessment_id}`;const report=await(await http('GET',reportPath)).json();
   await stop();address=await launch();
   expect((await(await http('GET',base+'/tasks/question-1')).json() as {files:unknown}).files).toEqual(files);
   expect((await(await http('GET',base+'/status')).json() as {expires_at:string}).expires_at).toBe(status.expires_at);
   expect(await(await http('GET',reportPath)).json()).toEqual(report);
   expect((await(await http('GET',base+'/status')).json() as {unlocks_used:number}).unlocks_used).toBe(1);
   const events=await pool.query('SELECT type FROM events WHERE assessment_id=$1',[created.assessment_id]);
   expect(events.rows.map(e=>e.type)).toEqual(expect.arrayContaining(['hint_served','assistant_message','tier_upgraded']));
  }finally{await stop();}
 });
 it('publishes only deterministically validated generated tasks and safe progress',async()=>{
  await app.close();
  const generated={novice:structuredClone(bank.novice![0]!),adept:structuredClone(bank.adept![0]!),master:structuredClone(bank.master![0]!)};
  for(const task of Object.values(generated)){task.title='Generated fixture';task.source='generated';}
  const generateAssessment:Ports['generateAssessment']=async (input)=>{
   input.progress({assessment_id:'private-provider-id',status:'validating',tier:'master'});
   return {kind:'ok',value:generated};
  };
  const validateTask:Ports['validateTask']=async ({task})=>({kind:'ok',value:{task_id:task.task_id,valid:true,structural_valid:true,semantic_verified:true,gates:[{gate:'reference',status:'pass',reason:'Reference passed all tests three times'}]}});
  app=await start({generateAssessment,validateTask});
  const cookie=await account();const id=await create(cookie);
  const state=await call('GET',`/assessments/${id}/status`,cookie);
  expect(state.json().generation.source).toBe('generated');expect(state.body).not.toContain('private-provider-id');
  expect(state.body).not.toMatch(/novice|adept|master/);
  const task=await call('GET',`/assessments/${id}/tasks/question-1`,cookie);
  expect(task.json().title).toBe('Generated fixture');expect(task.body).not.toContain('reference_files');
 });
  it('labels successful all-seed generation correctly',async()=>{
    await app.close();
    const generated = {
      novice: structuredClone(bank.novice![0]!),
      adept: structuredClone(bank.adept![0]!),
      master: structuredClone(bank.master![0]!),
    };
    const generateAssessment: Ports['generateAssessment'] = async()=>({
      kind:'ok',value:generated
    });
    const validateTask: Ports['validateTask'] = async ({task})=>({
      kind:'ok',
      value:{
        task_id:task.task_id,
        valid:true,structural_valid:true,semantic_verified:true,
        gates:[{gate:'reference',status:'pass',reason:'Reference passed'}]
      }
    });
    app=await start({generateAssessment,validateTask});
    const cookie=await account();
    const id=await create(cookie);
    const response=await call('GET',`/assessments/${id}/status`,cookie);
    expect(response.json().generation).toMatchObject({
      status:'ready',source:'seed_bank'
    });
    const saved=await pool.query(
      'SELECT source FROM generation_jobs WHERE assessment_id=$1',[id]
    );
    expect(saved.rows[0].source).toBe('seed_bank');
  });

 it('keeps the seed bank when deterministic validation rejects generated artifacts',async()=>{
  await app.close();
  const generateAssessment:Ports['generateAssessment']=async()=>({kind:'ok',value:{novice:{...bank.novice![0]!,source:'generated'},adept:{...bank.adept![0]!,source:'generated'},master:{...bank.master![0]!,source:'generated'}}});
  const validateTask:Ports['validateTask']=async (input,context)=>input.task.source==='seed_bank'?certifiedFixture(input,context):({kind:'ok',value:{task_id:input.task.task_id,valid:false,gates:[{gate:'reference',status:'fail',reason:'Reference failed'}]}});
  app=await start({generateAssessment,validateTask});const cookie=await account();const id=await create(cookie);
  expect((await call('GET',`/assessments/${id}/status`,cookie)).json().generation).toMatchObject({status:'ready',source:'seed_bank'});
 });
 it('preserves trusted event occurrence time when the transaction is flushed',async()=>{
  const cookie=await account();const id=await create(cookie);
  const owner=(await pool.query('SELECT user_id FROM assessments WHERE id=$1',[id])).rows[0].user_id;
  const occurred=new Date(Date.now()-30000).toISOString();
  const store=new PostgresAssessmentStore(pool);
  await store.withUser(owner,id,async()=>{
   const record=store.assessments.get(id)!;
   record.events.push({session_id:id,task_id:record.task.task_id,ts:occurred,type:'tab_hidden',source:'client',payload:{}});
  });
  const saved=(await pool.query("SELECT ts FROM events WHERE assessment_id=$1 AND type='tab_hidden'",[id])).rows[0];
  expect(saved.ts.toISOString()).toBe(occurred);
 });
 it('keeps queued generation bound to its original quiz focus after restart',async()=>{
  await app.close();let captured:Parameters<Ports['generateAssessment']>[0]|undefined;
  const generateAssessment:Ports['generateAssessment']=async input=>{captured=input;return {kind:'unavailable',code:'NOT_IMPLEMENTED',message:'No provider'};};
  app=await start({generateAssessment});const cookie=await account();
  await call('POST','/portfolio',cookie,portfolio);
  const original={domain:'backend',skills:['sql'],topics:['arrays']};
  await pool.query('UPDATE portfolios SET focus_lane=$1 WHERE is_latest',[original]);
  const created=await call('POST','/assessments',cookie,{});expect(created.statusCode).toBe(201);
  await app.close();await pool.query('UPDATE portfolios SET focus_lane=$1 WHERE is_latest',[{domain:'web',skills:['other'],topics:['strings']}]);
  app=await start({generateAssessment});
  const id=created.json().assessment_id;
  for(let i=0;i<80;i++){
   if((await call('GET',`/assessments/${id}/status`,cookie)).json().generation.status==='ready')break;
   await new Promise(r=>setTimeout(r,50));
  }
  expect(captured?.focus_lane).toEqual(original);
 });
 it('bounds deterministic validation with the generation deadline',async()=>{
  await app.close();
  const generateAssessment:Ports['generateAssessment']=async()=>({kind:'ok',value:{novice:bank.novice![0]!,adept:bank.adept![0]!,master:bank.master![0]!}});
  const validateTask:Ports['validateTask']=async({task})=>{
   await new Promise(r=>setTimeout(r,150));
   return {kind:'ok',value:{task_id:task.task_id,valid:true,structural_valid:true,semantic_verified:true,gates:[{gate:'reference',status:'pass',reason:'Reference passed'}]}};
  };
  app=await start({generateAssessment,validateTask},false,30);const cookie=await account();const id=await create(cookie,'failed');
  expect((await call('GET',`/assessments/${id}/status`,cookie)).json().generation.status).toBe('failed');
  expect((await call('GET',`/reports/report-${id}`,cookie)).statusCode).toBe(503);
 });
 it('ignores provider progress emitted after timeout has completed seed fallback',async()=>{
  await app.close();
  const generateAssessment:Ports['generateAssessment']=async input=>{
   setTimeout(()=>input.progress({assessment_id:'provider',status:'validating',tier:'master'}),120);
   return new Promise(()=>{});
  };
  app=await start({generateAssessment},false,30);const cookie=await account();const id=await create(cookie);
  await new Promise(r=>setTimeout(r,160));
  expect((await call('GET',`/assessments/${id}/status`,cookie)).json().generation).toMatchObject({status:'ready',source:'seed_bank'});
 });
 it('paginates all completed report history without crossing user ownership',async()=>{
  const cookie=await account();const id=await create(cookie);
  await app.close();await pool.query("UPDATE assessments SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);app=await start();
  const report=(await call('GET',`/reports/report-${id}`,cookie)).json();
  await pool.query(`WITH copies AS (
   INSERT INTO assessments(id,user_id,profile_id,focus_lane,current_tier,unlocks_used,started_at,expires_at,status,expired_finalized)
   SELECT gen_random_uuid(),user_id,profile_id,focus_lane,current_tier,unlocks_used,started_at,expires_at,'finished',true FROM assessments CROSS JOIN generate_series(1,101) WHERE id=$1 RETURNING id,user_id
  ) INSERT INTO reports(id,assessment_id,user_id,report) SELECT 'report-'||id,id,user_id,$2 FROM copies`,[id,report]);
  const first=(await call('GET','/reports',cookie)).json();expect(first.reports).toHaveLength(100);expect(first.next_cursor).toBeTruthy();
  const second=(await call('GET',`/reports?before=${first.next_cursor}`,cookie)).json();expect(second.reports).toHaveLength(2);expect(second.next_cursor).toBeUndefined();
  expect(new Set([...first.reports,...second.reports].map((r:{id:string})=>r.id)).size).toBe(102);
  const other=await account('other@example.org');
  expect((await call('GET',`/reports?before=${first.next_cursor}`,other)).statusCode).toBe(404);
 });
 it('rolls back duplicate runner identities rather than dropping a grade while logging an event',async()=>{
  await app.close();const run_id=randomUUID();
  const duplicate:Ports['runTests']=async(input,context)=>{const result=await runTests(input,context);if(result.kind==='ok')result.value.run_id=run_id;return result;};
  app=await start({runTests:duplicate});const cookie=await account();const id=await create(cookie);
  const path=`/assessments/${id}/tasks/question-1/run`;
  expect((await call('POST',path,cookie,{})).statusCode).toBe(200);
  expect((await call('POST',path,cookie,{})).statusCode).toBe(503);
  expect((await pool.query('SELECT count(*)::int AS n FROM runs WHERE assessment_id=$1',[id])).rows[0].n).toBe(1);
  expect((await pool.query("SELECT count(*)::int AS n FROM events WHERE assessment_id=$1 AND type='run'",[id])).rows[0].n).toBe(1);
 });
 it('trusts the first forwarded IP only when explicitly configured',async()=>{
  for(const trusted of [false,true]){
   await app.close();await pool.query('TRUNCATE auth_rate_limits');app=await start({},trusted);
   for(let i=0;i<20;i++)await app.inject({method:'POST',url:'/auth/login',headers:{origin,'x-forwarded-for':`192.0.2.${i+1}, 192.0.2.250`},payload:{email:`missing${i}@example.org`,password:'test correct horse battery staple'}});
   const result=await app.inject({method:'POST',url:'/auth/login',headers:{origin,'x-forwarded-for':'192.0.2.100, 192.0.2.250'},payload:{email:'last@example.org',password:'test correct horse battery staple'}});
   expect(result.statusCode).toBe(trusted?401:429);
  }
  const config={APP_MODE:'auth',DATABASE_URL:'postgres://localhost/test',AUTH_ORIGIN:origin};
  expect(readConfig({...config,TRUST_PROXY:'true'})).toMatchObject({trust_proxy:true});
  expect(readConfig(config)).toMatchObject({trust_proxy:false});
  expect(()=>readConfig({...config,TRUST_PROXY:'yes'})).toThrow();
 });
 it('keeps report claims bound to the original portfolio after upload and database restart',async()=>{
  const cookie=await account();const id=await create(cookie);
  expect((await call('POST',`/assessments/${id}/tasks/question-1/submit`,cookie,{})).statusCode).toBe(200);
  const before=(await call('GET',`/reports/report-${id}`,cookie)).json();
  expect(before.claims).toContainEqual({topic:'arrays',tested_by:bank.novice![0]!.task_id,demonstrated:true});
  const uploaded=await call('POST','/portfolio',cookie,{...portfolio,dsa_topics_solved:['hashing']});
  expect(uploaded.statusCode).toBe(200);
  expect(uploaded.json().profile.claimed_topics).toEqual(['hashing']);
  await app.close();app=await start();
  const after=await call('GET',`/reports/report-${id}`,cookie);
  expect(after.statusCode).toBe(200);expect(after.json().claims).toEqual(before.claims);
 });

});
