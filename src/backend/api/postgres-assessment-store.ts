import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Report, RunResult, Tier } from '@torquecode/contracts';
import type { InternalRunResult } from '../contracts/internal.js';
import { AssessmentStore, type AssessmentRecord, type StoredProfile, type GenerationJob } from './assessment-store.js';
import { publicRun } from './public-projections.js';
import { HttpProblem } from './errors.js';
import { VALIDATION_POLICY } from '../generation/families.js';
import { TIER_ORDER } from './tier-policy.js';

type Unit = {
 client: PoolClient; userId: string; profiles: Map<string, StoredProfile>; assessments: Map<string, AssessmentRecord>;
 profileId?: string; originalProfile?: string; originalFocus?: string;
 eventCounts: Map<string, number>; runCounts: Map<string,number>; signatures: Map<string,string>; reports: Map<string, Report>;
};

// Maps are transaction-local working copies, never a process-wide assessment cache.
// A per-user transaction lock serializes state transitions across API instances.
export class PostgresAssessmentStore extends AssessmentStore {
 private readonly units = new AsyncLocalStorage<Unit>();
 constructor(readonly pool: Pool) { super(); }
 private unit() { const unit = this.units.getStore(); if (!unit) throw new Error('Assessment transaction required'); return unit; }
 override get profiles() { return this.unit().profiles; }
 override get assessments() { return this.unit().assessments; }
 override get durable() { return true; }

 override async withUser<T>(userId: string, id: string | undefined, action: () => Promise<T>, includeActive = false): Promise<T> {
  const client = await this.pool.connect().catch(() => { throw new HttpProblem(503, 'PERSISTENCE_UNAVAILABLE'); });
  try {
   await client.query('BEGIN');
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 8432063))", [userId]);
   const unit: Unit = { client, userId, profiles: new Map(), assessments: new Map(), eventCounts: new Map(), runCounts: new Map(), signatures: new Map(), reports: new Map() };
   const profile = await client.query('SELECT id,profile,portfolio,focus_lane FROM portfolios WHERE user_id=$1 AND is_latest', [userId]);
   if (profile.rowCount) {
    const row = profile.rows[0]; unit.profileId = row.id;
    const stored: StoredProfile = { profile: row.profile, portfolio: row.portfolio, ...(row.focus_lane ? { focus_lane: row.focus_lane } : {}) };
    unit.profiles.set(userId, stored); unit.originalProfile = JSON.stringify(stored.profile); unit.originalFocus = JSON.stringify(stored.focus_lane);
   }
   const recordId = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
   const rows = await client.query(`SELECT * FROM assessments WHERE user_id=$1 AND (id=$2 OR ($3 AND status='active')) FOR UPDATE`, [userId, recordId, includeActive]);
   for (const row of rows.rows) {
    const taskRows = await client.query('SELECT * FROM assessment_tasks WHERE assessment_id=$1 ORDER BY position', [row.id]);
    const sets: AssessmentRecord['question_sets'] = {};
    const files = await client.query('SELECT task_id,path,content FROM task_files WHERE assessment_id=$1', [row.id]);
    for (const item of taskRows.rows) {
     const task = item.private_task;
     const work = { task, hint_level: item.hint_level, files: task.files.map((file: {path: string;content:string;editable:boolean}) => {
      const saved = files.rows.find(f => f.task_id === item.task_id && f.path === file.path);
      return { ...file, content: file.editable && saved ? saved.content : file.content };
     }) };
     (sets[item.tier as Tier] ??= []).push(work);
    }
    const current = sets[row.current_tier as Tier]?.[0];
    if (!current) throw new Error('Persisted assessment missing current task');
    const events = await client.query('SELECT * FROM events WHERE assessment_id=$1 ORDER BY ordinal', [row.id]);
    const runs = await client.query('SELECT result FROM runs WHERE assessment_id=$1 ORDER BY ts,run_id', [row.id]);
    const job = await client.query('SELECT status,progress,receipts,source FROM generation_jobs WHERE assessment_id=$1', [row.id]);
    const originalProfile = await client.query('SELECT profile FROM portfolios WHERE id=$1 AND user_id=$2', [row.profile_id,userId]);
    const record: AssessmentRecord = {
     profile_snapshot: originalProfile.rows[0]?.profile, focus_snapshot: row.focus_lane,
     session: { id: row.id, user_id: row.user_id, current_tier: row.current_tier, status: row.status, started_at: row.started_at.toISOString(), expires_at: row.expires_at.toISOString() },
     profile_id: row.profile_id, task: current.task, files: current.files, hint_level: current.hint_level,
     question_sets: sets, tier_work: Object.fromEntries(TIER_ORDER.filter(t => sets[t]?.length).map(t => [t,sets[t]![0]])),
     unlocked_tiers: TIER_ORDER.slice(0,row.unlocks_used+1),
     events: events.rows.map(e => ({ session_id: row.id, task_id: e.task_id, ts: e.ts.toISOString(), source: e.source, type: e.type, payload: e.payload })),
     runs: runs.rows.map(r => this.restoreRun(r.result, taskRows.rows.map(t => t.private_task))),
     ...(row.auto_submit_error ? { auto_submit_error: row.auto_submit_error } : {}),
     ...(row.expired_finalized ? { expiry: Promise.resolve() } : {}),
     ...(job.rows[0] ? { generation: { status: job.rows[0].status, progress: job.rows[0].progress, receipts: job.rows[0].receipts, ...(job.rows[0].source ? { source: job.rows[0].source } : {}) } as GenerationJob } : {}),
    };
    unit.assessments.set(row.id, record); unit.eventCounts.set(row.id, record.events.length); unit.runCounts.set(row.id,record.runs.length); unit.signatures.set(row.id,this.signature(record));
   }
   return await this.units.run(unit, async () => {
    let result: T;
    try { result = await action(); }
    catch (error) {
      // Expiration is authoritative even when the triggering request is rejected.
      if (error instanceof HttpProblem && error.statusCode < 500 && [...unit.assessments.values()].some(r => r.events.some(e=>e.type==='session_end'))) {
        await this.flush(unit); await client.query('COMMIT');
      }
      throw error;
    }
    await this.flush(unit);
    await client.query('COMMIT');
    return result;
   });
  } catch (error) {
   await client.query('ROLLBACK').catch(() => undefined);
   if (error instanceof HttpProblem) throw error;
   throw new HttpProblem(503,'PERSISTENCE_UNAVAILABLE');
  } finally { client.release(); }
 }
 private restoreRun(result: RunResult, tasks: AssessmentRecord['task'][]): InternalRunResult {
  const task = tasks.find(t => t.task_id === result.task_id);
  const hiddenIds = task?.tests.filter(t => t.visibility === 'hidden').flatMap(t => t.ids) ?? [];
  return { run_id: result.run_id, task_id: result.task_id, mode: result.mode,
   tests: [...result.visible.map(t => ({ ...t, visibility: 'visible' as const })),
    ...(result.hidden ? hiddenIds.map((id,i) => ({ id, visibility: 'hidden' as const, status: i < result.hidden!.passed ? 'pass' as const : 'fail' as const, duration_ms: 0 })) : [])],
   passed: result.passed, total: result.total, stdout: result.stdout, stderr: result.stderr, timed_out: result.timed_out };
 }
 private signature(record: AssessmentRecord) {
  return JSON.stringify({ session:record.session, question_sets:record.question_sets, generation:record.generation, error:record.auto_submit_error, events:record.events.length, runs:record.runs.length, finalized:!!record.expiry });
 }
 private async flush(unit: Unit) {
  const { client, userId } = unit;
  const profile = unit.profiles.get(userId);
  if (profile && (!unit.profileId || JSON.stringify(profile.profile) !== unit.originalProfile || profile.reuploaded)) {
   await client.query('UPDATE portfolios SET is_latest=false WHERE user_id=$1 AND is_latest', [userId]);
   unit.profileId = randomUUID();
   await client.query('INSERT INTO portfolios(id,user_id,profile,portfolio,focus_lane) VALUES($1,$2,$3,$4,$5)', [unit.profileId,userId,profile.profile,profile.portfolio ?? {},profile.focus_lane ?? null]);
  } else if (profile && unit.profileId && JSON.stringify(profile.focus_lane) !== unit.originalFocus) {
   await client.query('UPDATE portfolios SET focus_lane=$1 WHERE id=$2 AND user_id=$3', [profile.focus_lane ?? null,unit.profileId,userId]);
  }
  for (const record of unit.assessments.values()) {
   if (unit.signatures.get(record.session.id) === this.signature(record)) continue;
   const { session } = record;
   await client.query(`INSERT INTO assessments(id,user_id,profile_id,current_tier,unlocks_used,started_at,expires_at,status,auto_submit_error,expired_finalized,focus_lane)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET current_tier=$4,unlocks_used=$5,status=$8,auto_submit_error=$9,expired_finalized=$10 WHERE assessments.user_id=$2`,
    [session.id,userId,record.profile_id ?? unit.profileId,session.current_tier,TIER_ORDER.indexOf(session.current_tier),session.started_at,session.expires_at,session.status,record.auto_submit_error ?? null,record.events.some(e => e.type==='session_end'), record.focus_snapshot]);
   const taskIds = TIER_ORDER.flatMap(t => (record.question_sets?.[t] ?? []).map(w=>w.task.task_id));
   await client.query('DELETE FROM assessment_tasks WHERE assessment_id=$1 AND NOT(task_id=ANY($2::text[]))', [session.id,taskIds]);
   for (const tier of TIER_ORDER) for (const [position,work] of (record.question_sets?.[tier] ?? []).entries()) {
    await client.query(`INSERT INTO assessment_tasks(assessment_id,task_id,tier,position,private_task,hint_level) VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(assessment_id,task_id) DO UPDATE SET hint_level=$6,private_task=$5,tier=$3,position=$4`, [session.id,work.task.task_id,tier,position,work.task,work.hint_level]);
    for (const file of work.files.filter(f => f.editable)) await client.query(`INSERT INTO task_files(assessment_id,task_id,path,content) VALUES($1,$2,$3,$4)
     ON CONFLICT(assessment_id,task_id,path) DO UPDATE SET content=$4`, [session.id,work.task.task_id,file.path,file.content]);
   }
   for (const run of record.runs.slice(unit.runCounts.get(session.id) ?? 0)) await client.query('INSERT INTO runs(run_id,assessment_id,task_id,result) VALUES($1,$2,$3,$4)', [run.run_id,session.id,run.task_id,publicRun(run)]);
   for (let ordinal=unit.eventCounts.get(session.id) ?? 0;ordinal<record.events.length;ordinal++) {
    const event = record.events[ordinal]!;
    await client.query('INSERT INTO events(assessment_id,ordinal,task_id,type,source,payload,ts) VALUES($1,$2,$3,$4,$5,$6,$7)', [session.id,ordinal,event.task_id,event.type,event.source,event.payload,event.ts]);
   }
   if (record.generation) await client.query(`INSERT INTO generation_jobs(id,assessment_id,user_id,status,progress,receipts,source) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(assessment_id) DO UPDATE SET status=$4,progress=$5,receipts=$6,source=$7,updated_at=clock_timestamp()`, [session.id,session.id,userId,record.generation.status,record.generation.progress,JSON.stringify(record.generation.receipts),record.generation.source ?? null]);
  }
  for (const [id,report] of unit.reports) await client.query(`INSERT INTO reports(id,assessment_id,user_id,report) VALUES($1,$2,$3,$4)
   ON CONFLICT(id) DO UPDATE SET report=$4 WHERE reports.user_id=$3`, [report.report_id,id,userId,report]);
 }
 override async pendingExpirations(): Promise<{user_id:string;id:string}[]> {
  return (await this.pool.query("SELECT user_id,id FROM assessments WHERE expires_at<=now() AND NOT expired_finalized ORDER BY expires_at LIMIT 20")).rows;
 }
 override async pendingGenerations(): Promise<{user_id:string;id:string}[]> {
  return (await this.pool.query("SELECT g.user_id,g.assessment_id AS id FROM generation_jobs g JOIN assessments a ON a.id=g.assessment_id WHERE a.status='active' AND (g.status IN ('queued','generating','validating') OR (g.status='ready' AND (g.progress->>'verification_policy' IS DISTINCT FROM $1 OR g.progress->>'semantic_verified' IS DISTINCT FROM 'true'))) ORDER BY g.created_at LIMIT 20",[VALIDATION_POLICY])).rows;
 }
 override async withGenerationClaim(id:string,action:()=>Promise<void>) {
  const client = await this.pool.connect();
  try {
   const lock = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,8432064)) AS locked', [id]);
   if (!lock.rows[0].locked) return;
   try { await action(); }
   finally { await client.query('SELECT pg_advisory_unlock(hashtextextended($1,8432064))', [id]); }
  } finally { client.release(); }
 }
 override async enforceRunRate(record: AssessmentRecord) {
  const result = await this.unit().client.query("SELECT count(*)::int AS n FROM runs WHERE assessment_id=$1 AND ts>clock_timestamp()-interval '1 minute'", [record.session.id]);
  if (result.rows[0].n>=30) throw new HttpProblem(429,'RUN_RATE_LIMIT');
 }
 override saveReport(id: string, report: Report) { this.unit().reports.set(id,report); }
 override async readReport(id: string): Promise<Report | undefined> {
  const pending = [...this.unit().reports.values()].find(report=>report.report_id===id);
  if (pending) return pending;
  return (await this.unit().client.query('SELECT report FROM reports WHERE id=$1 AND user_id=$2', [id,this.unit().userId])).rows[0]?.report;
 }
 override async reportHistory(before?:string) {
  if (before && !(await this.unit().client.query("SELECT r.id FROM reports r JOIN assessments a ON a.id=r.assessment_id WHERE r.id=$1 AND r.user_id=$2 AND a.status='finished'",[before,this.unit().userId])).rowCount) throw new HttpProblem(404,'NOT_FOUND');
  return (await this.unit().client.query(`SELECT r.id,r.created_at,(r.report->>'final_score')::float AS final_score,r.report->>'outcome' AS outcome
   FROM reports r JOIN assessments a ON a.id=r.assessment_id WHERE r.user_id=$1 AND a.status='finished' AND ($2::text IS NULL OR (r.created_at,r.id)<(SELECT created_at,id FROM reports WHERE id=$2 AND user_id=$1)) ORDER BY r.created_at DESC,r.id DESC LIMIT 101`, [this.unit().userId,before ?? null])).rows.map(r => ({...r,created_at:r.created_at.toISOString()}));
 }
}
