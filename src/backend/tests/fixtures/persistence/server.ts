// Test-only backend process. Real PostgreSQL/auth/routes; fake runner and chat isolate external services.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { buildApp } from '../../../api/app.js';
import { readAuthUser } from '../../../api/auth.js';
import { PostgresAssessmentStore } from '../../../api/postgres-assessment-store.js';
import { loadSeedBank } from '../../../api/seed-bank.js';
import { createWiredPorts } from '../../../api/wiring.js';
import type { Ports } from '../../../contracts/seams.js';

// Test-only validation double: persistence is isolated from grading; real oracle verification is covered by generation suites.
const certifiedFixture: Ports['validateTask'] = async ({task}) => ({kind:'ok',value:{task_id:task.task_id,valid:true,structural_valid:true,semantic_verified:true,family_id:task.family_id??'persistence-fixture',gates:[{gate:'differential',status:'pass',reason:'Test-only certificate double'}]}});
if (process.env.TORQUECODE_ISOLATED_TEST_DB !== '1' || !process.send) throw new Error('Isolated test process required');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const bank=await loadSeedBank();const seed=bank.novice![0]!;
const origin='http://127.0.0.1:3001';const auth={pool,origin,secure:false};
const runTests:Ports['runTests']=async input=>{
 const tests=input.tests.filter(t=>input.mode==='submit'||t.visibility==='visible').flatMap(t=>t.ids.map(id=>({id,visibility:t.visibility,status:'pass' as const,duration_ms:1})));
 return {kind:'ok',value:{run_id:randomUUID(),task_id:input.task_id,mode:input.mode,tests,passed:tests.length,total:tests.length,stdout:'',stderr:'',timed_out:false}};
};
const chat:Ports['chat']=async()=>({kind:'ok',value:{content:'Trace the retained event count after each operation.',model:'test'}});
const app=await buildApp({ports:createWiredPorts(seed,{runTests,chat,validateTask:certifiedFixture}),auth,assessment:{store:new PostgresAssessmentStore(pool),seed,seed_bank:bank,origin,authenticate:async req=>(await readAuthUser(req,auth))?.user_id}});
process.once('SIGTERM',()=>{void app.close().then(()=>pool.end()).then(()=>process.exit(0));});
const address=await app.listen({host:'127.0.0.1',port:0});
process.send({address});
