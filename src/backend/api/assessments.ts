import { randomUUID } from 'node:crypto';
import { TIER_ORDER, allQuestionsSubmitted, nextTier } from './tier-policy.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import { Id, ApiError, AssessmentState, AssistantResponse, CandidateTask, EventsRequest, FocusLaneResponse, HintResponse, PortfolioResponse, QuizAnswers, QuizResponse, Report, ReportHistory, RunFilesRequest, RunResult, TaskFilesRequest } from '@torquecode/contracts';
import type { File, Tier } from '@torquecode/contracts';
import type { Event, InternalRunResult, PrivateTask, SeamResult } from '../contracts/internal.js';
import type { Ports } from '../contracts/seams.js';
import { parsePortfolioDetailed, validPortfolio } from '../intake/portfolio.js';
import { extractEvidence, type PortfolioEvidence } from '../intake/evidence.js';
import { hashEditableFiles } from '../scoring/aie.js';
import { AssessmentStore, type AssessmentRecord, type TierWork } from './assessment-store.js';
import type { RunnerStatus } from './runner-status.js';
import { HttpProblem } from './errors.js';
import { publicRun, publicTask } from './public-projections.js';
import { createAssistant } from '../llm/assistant.js';
import { VALIDATION_POLICY } from '../generation/families.js';
import { createHintProvider } from '../llm/hints.js';

export type AssessmentOptions = {
  store: AssessmentStore; seed: PrivateTask; origin: string;
  seed_bank?: Partial<Record<Tier, PrivateTask[]>>;
  authenticate: (request: FastifyRequest) => Promise<string | undefined>;
  generation_timeout_ms?: number; now?: () => number; runner?: 'immutable_seed_only' | 'isolated'; runner_status?: RunnerStatus;
};
const empty = Type.Object({}, { additionalProperties: false });
const ok = Type.Object({ ok: Type.Literal(true) }, { additionalProperties: false });
const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError, 413: ApiError, 422: ApiError, 429: ApiError, 500: ApiError, 503: ApiError };
function real<T>(result: SeamResult<T>): T {
  if (result.kind !== 'ok') throw new HttpProblem(503, result.kind === 'unavailable' ? result.code : 'FIXTURE_UNAVAILABLE');
  return result.value;
}

// Bound every external stage even when an adapter fails to honour AbortSignal.
function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new Error('Operation cancelled'));
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    work.then(value => { signal.removeEventListener('abort', aborted); resolve(value); },
      error => { signal.removeEventListener('abort', aborted); reject(error); });
  });
}

export async function registerAssessments(app: FastifyInstance, ports: Ports, options: AssessmentOptions) {
  const { store, seed } = options;
  const now = options.now ?? Date.now;
  const identities = new WeakMap<FastifyRequest, string>();
  let executions = 0;
  const closing = new AbortController();
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin !== options.origin) throw new HttpProblem(403, 'ORIGIN_REJECTED');
    const user = await options.authenticate(request);
    if (!user) throw new HttpProblem(401, 'UNAUTHENTICATED');
    identities.set(request, user);
  });
  app.addHook('onRoute', route => {
    const handler = route.handler;
    route.handler = async function(request, reply) {
      const params = request.params as { id?: string };
      const rawId = params?.id;
      const id = rawId?.startsWith('report-') ? rawId.slice(7) : rawId;
      return store.withUser(identities.get(request)!, id,
        async () => handler.call(this, request, reply), request.routeOptions.url === '/assessments');
    };
  });
  const user = (request: FastifyRequest) => identities.get(request)!;
  const emit = (record: AssessmentRecord, type: Event['type'], payload: Event['payload'], ts = now(), source: Event['source'] = 'server', taskId = record.task.task_id) => {
    record.events.push({ session_id: record.session.id, task_id: taskId, ts: new Date(ts).toISOString(), type, source, payload });
  };
  const works = (record: AssessmentRecord, tier: Tier): TierWork[] =>
    record.question_sets?.[tier] ??
    (record.tier_work?.[tier] ? [record.tier_work[tier]!] : []);

  const publicId = (record: AssessmentRecord, id: string): string => {
    const ids = TIER_ORDER.flatMap(tier =>
      works(record, tier).map(w => w.task.task_id)
    );
    const index = ids.indexOf(id);
    if (index < 0) throw new HttpProblem(404, 'NOT_FOUND');
    return `question-${index + 1}`;
  };

  const certified = (record: AssessmentRecord) => !store.durable || (record.generation?.progress.verification_policy === VALIDATION_POLICY && record.generation.progress.semantic_verified === true);
  const taskWork = (record: AssessmentRecord, id: string): TierWork => {
    if (record.generation && (record.generation.status !== 'ready' || !certified(record))) throw new HttpProblem(409, 'ASSESSMENT_GENERATING');
    for (const tier of TIER_ORDER) {
      const work = works(record, tier).find(w => w.task.task_id === id || publicId(record, w.task.task_id) === id);
      if (!work) continue;
      if (TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(record.session.current_tier))
        throw new HttpProblem(403, 'TASK_LOCKED');
      return work;
    }
    throw new HttpProblem(404, 'NOT_FOUND');
  };

  const syncCurrent = (record: AssessmentRecord, work: TierWork) => {
    if (record.task.task_id === work.task.task_id) {
      record.files = structuredClone(work.files);
      record.hint_level = work.hint_level;
    }
  };

  const canUnlock = (record: AssessmentRecord): boolean => {
    const next = nextTier(record.session.current_tier);
    return record.session.status === 'active' &&
      now() < Date.parse(record.session.expires_at) &&
      (!record.generation || (record.generation.status==='ready'&&certified(record))) &&
      next !== null &&
      works(record, next).length > 0 &&
      allQuestionsSubmitted(
        works(record, record.session.current_tier)
          .map(w => w.task.task_id),
        record.runs,
      );
  };

  function checkedFiles(work: TierWork, files: File[]): File[] {
    const editable = work.task.files.filter(file => file.editable);
    if (files.length !== editable.length || new Set(files.map(f => f.path)).size !== files.length) throw new HttpProblem(400, 'INVALID_FILES');
    if (files.some(file => !editable.some(expected => expected.path === file.path))) throw new HttpProblem(400, 'INVALID_FILES');
    return work.task.files.map(expected => {
      if (!expected.editable) return { ...expected };
      const supplied = files.find(f => f.path === expected.path);
      if (!supplied || supplied.editable !== true) throw new HttpProblem(400, 'INVALID_FILES');
      return { path: expected.path, content: supplied.content, editable: true };
    });
  }
  async function execute(record: AssessmentRecord, work: TierWork, mode: 'run' | 'submit', ts = now(), automatic = false): Promise<InternalRunResult> {
    if (record.operation) throw new HttpProblem(409, 'EXECUTION_IN_PROGRESS');
    if (executions >= 2) throw new HttpProblem(429, 'RUNNER_BUSY');
    if (!automatic) await store.enforceRunRate(record);
    const files = structuredClone(work.files);
    const files_hash = hashEditableFiles(files);
    executions++;
    const operation = (async () => {
      const context = { signal: AbortSignal.any([closing.signal, AbortSignal.timeout(work.task.limits.wall_time_ms + 1000)]) };
      const outcome = await ports.runTests({ task_id: work.task.task_id, files, tests: structuredClone(work.task.tests), limits: { ...work.task.limits }, mode }, context);
      if (outcome.kind === 'unavailable') {
        if (options.runner_status?.runner === 'isolated') options.runner_status.available = false;
        throw new HttpProblem(503, 'SANDBOX_UNAVAILABLE');
      }
      const result = real(outcome);
      // Validate identity/mode before associating a runner result with this user/session.
      if (result.task_id !== work.task.task_id || result.mode !== mode) throw new Error('Runner result mismatch');
      // K10: validate results against the server-owned test manifest.
      // An incomplete or forged result must never count as a grade.
      const selectedTests = work.task.tests.filter(
        test => mode === 'submit' || test.visibility === 'visible',
      );
      const expectedIds = selectedTests.flatMap(test => test.ids);
      const expected = new Map(
        selectedTests.flatMap(test =>
          test.ids.map(id => [id, test.visibility] as const),
        ),
      );
      const actualIds = result.tests.map(test => test.id);

      if (
        expectedIds.length === 0 ||
        expected.size !== expectedIds.length ||
        result.tests.length !== expectedIds.length ||
        new Set(actualIds).size !== expectedIds.length ||
        result.total !== expectedIds.length ||
        result.passed !== result.tests.filter(
          test => test.status === 'pass',
        ).length ||
        result.tests.some(
          test => expected.get(test.id) !== test.visibility,
        )
      ) {
        throw new HttpProblem(503, 'SANDBOX_UNAVAILABLE');
      }

      publicRun(result); // Reject run-mode hidden results before storing/returning.
      if (options.runner_status?.runner === 'isolated') options.runner_status.available = true;
      record.runs.push(result);
      emit(record, mode, { run_id: result.run_id, files_hash }, ts, 'server', work.task.task_id);

      return result;
    })();
    record.operation = operation;
    try { return await operation; }
    finally { delete record.operation; executions--; }
  }
  async function expire(record: AssessmentRecord): Promise<void> {
    if (record.expiry) return record.expiry;
    if (record.generation?.status === 'failed') return;
    if (now() < Date.parse(record.session.expires_at)) return;
    if (store.durable && !certified(record)) {
      record.session.status = 'finished';
      record.auto_submit_error = 'TASK_VALIDATION_REQUIRED';
      record.generation = {status:'failed',progress:{},receipts:[]};
      record.expiry = Promise.resolve();
      if(!record.events.some(e=>e.type==='session_end'))emit(record,'session_end',{reason:'unverified_at_expiry'},now());
      return;
    }
    record.session.status = 'finished';
    const expiry = (async () => {
      try {
        if (record.operation) await record.operation.catch(() => undefined);
        for (const tier of TIER_ORDER) {
          if (TIER_ORDER.indexOf(tier) >
              TIER_ORDER.indexOf(record.session.current_tier)) break;
          for (const work of works(record, tier)) {
            try {
              await execute(record, work, 'submit',
                Date.parse(record.session.expires_at), true);
            } catch (error) {
              record.auto_submit_error ??= error instanceof HttpProblem
                ? error.code : 'AUTO_SUBMIT_FAILED';
            }
          }
        }
      } catch (error) { record.auto_submit_error = error instanceof HttpProblem ? error.code : 'AUTO_SUBMIT_FAILED'; }
      emit(record, 'session_end', { reason: 'expired', ...(record.auto_submit_error ? { auto_submit_error: record.auto_submit_error } : {}) }, Date.parse(record.session.expires_at));
      store.saveReport(record.session.id, buildReport(record));
    })();
    record.expiry = expiry;
    return expiry;
  }
  let generationFlight: Promise<void> | undefined;
  async function generatePending() {
    for (const pending of await store.pendingGenerations()) {
      if (closing.signal.aborted) return;
      await store.withGenerationClaim(pending.id,async()=>{
        let profile: import('../contracts/internal.js').CandidateProfile|undefined;
        let focus: import('../contracts/internal.js').FocusLane|undefined;
        let evidence: PortfolioEvidence|undefined;
        let fallbackTasks:PrivateTask[]=[];
        let revalidate=false;
        await store.withUser(pending.user_id,pending.id,async()=>{
          const record=store.assessments.get(pending.id);
          if(!record?.generation || record.session.status!=='active' || (record.generation.status==='ready'&&certified(record)))return;
          profile=record.profile_snapshot??store.profiles.get(pending.user_id)?.profile;
          focus=record.focus_snapshot;
          // Evidence comes from the immutable portfolio row this assessment started with, never a later upload.
          const portfolio=validPortfolio(record.portfolio_snapshot);
          if(portfolio&&profile)evidence=extractEvidence(portfolio,profile.claimed_topics);
          fallbackTasks=TIER_ORDER.flatMap(t=>works(record,t).map(w=>structuredClone(w.task)));
          revalidate=record.generation.status==='ready'||record.generation.progress.revalidate_existing===true;
          record.generation.status='validating';
          if(revalidate)record.generation.progress={revalidate_existing:true};
        });
        if(!profile)return;
        const signal=AbortSignal.any([closing.signal,AbortSignal.timeout(options.generation_timeout_ms??120000)]);
        type Checked={tasks:PrivateTask[];receipts:import('../contracts/internal.js').Gate[]};
        const verify=async(tasks:PrivateTask[]):Promise<Checked|undefined>=>{
          if(!tasks.length||new Set(tasks.map(t=>t.task_id)).size!==tasks.length)return;
          const receipts:import('../contracts/internal.js').Gate[]=[];
          for(const task of tasks){
            const result=await bounded(ports.validateTask({task,claimed_topics:profile!.claimed_topics},{signal}),signal);
            if(result.kind!=='ok'||!result.value.valid||result.value.semantic_verified!==true||result.value.structural_valid!==true||!result.value.gates.length||result.value.gates.some(g=>g.status!=='pass'&&g.status!=='not_applicable'))return;
            receipts.push(...result.value.gates);
          }
          return {tasks,receipts};
        };
        let checked:Checked|undefined,adopt=false;
        // Certify the fallback first. A later provider timeout may use this evidence,
        // but never turns an unchecked fallback into a passing assessment.
        try { checked=await verify(fallbackTasks); } catch { /* unverified */ }
        if(!revalidate && !signal.aborted)try{
          const result=await bounded(ports.generateAssessment({profile,focus_lane:focus??{domain:profile.domain,topics:profile.claimed_topics,skills:profile.skills},...(evidence?{evidence}:{}),progress:()=>{}},{signal}),signal);
          if(result.kind==='ok'){
            const tasks=TIER_ORDER.map(t=>result.value[t]);
            if(tasks.every((task,i)=>task.tier===TIER_ORDER[i])){
              const proposed=await verify(tasks);
              if(proposed){checked=proposed;adopt=true;}
            }
          }
        }catch { /* Preserve only an independently verified fallback, if available. */ }
        if(closing.signal.aborted)return;
        await store.withUser(pending.user_id,pending.id,async()=>{
          const record=store.assessments.get(pending.id);
          if(!record?.generation)return;
          if(!checked || record.session.status!=='active'||now()>=Date.parse(record.session.expires_at)){
            record.generation={status:'failed',progress:{},receipts:[]};
            record.session.status='finished';record.auto_submit_error='TASK_VALIDATION_FAILED';
            record.expiry=Promise.resolve();
            if(!record.events.some(e=>e.type==='session_end'))emit(record,'session_end',{reason:'task_validation_failed'});
            return;
          }
          if(adopt){
            record.question_sets={};record.tier_work={};
            for(const task of checked.tasks){const work={task:structuredClone(task),files:structuredClone(task.files),hint_level:0};record.question_sets[task.tier]=[work];record.tier_work[task.tier]=work;}
            const first=record.question_sets.novice![0]!;record.task=first.task;record.files=first.files;
          }
          if(!revalidate){const released=now();record.session.started_at=new Date(released).toISOString();record.session.expires_at=new Date(released+3600000).toISOString();}
          record.generation={status:'ready',source:checked.tasks.some(t=>t.source==='generated')?'generated':'seed_bank',progress:{verification_policy:VALIDATION_POLICY,semantic_verified:true},receipts:checked.receipts.slice(0,30).map(g=>({gate:g.gate,status:g.status,reason:g.reason.slice(0,300)}))};
        });
      });
    }
  }
  let recoveryFlight: Promise<void> | undefined;
  let sweeping = false;
  const recover = async () => {
    if (sweeping || closing.signal.aborted) return;
    sweeping = true;
    try {
      if (store.durable) {
        for (const pending of await store.pendingExpirations()) {
          await store.withUser(pending.user_id, pending.id, async () => {
            const record = store.assessments.get(pending.id);
            if (record) await expire(record);
          });
        }
      } else {
        for (const record of store.assessments.values()) if (!record.expiry && now() >= Date.parse(record.session.expires_at)) await expire(record);
      }
    } catch { app.log.error('Assessment recovery unavailable'); }
    finally { sweeping = false; }
  };
  const timer = setInterval(() => { if (!recoveryFlight) recoveryFlight = recover().finally(() => { recoveryFlight = undefined; }); if (store.durable && !generationFlight) generationFlight = generatePending().catch(() => { app.log.error('Generation recovery unavailable'); }).finally(() => { generationFlight = undefined; }); }, 1000);
  timer.unref();
  app.addHook('onReady', async () => { await recover(); if (store.durable) generationFlight = generatePending().catch(() => { app.log.error('Generation recovery unavailable'); }).finally(() => { generationFlight = undefined; }); });
  app.addHook('onClose', async () => {
    clearInterval(timer); closing.abort();
    await generationFlight;
    await recoveryFlight;
    if (!store.durable) await Promise.allSettled([...store.assessments.values()].flatMap(r => [r.operation, r.expiry].filter(p => p !== undefined)));
  });
  async function owned(request: FastifyRequest, task = false) {
    const params = request.params as { id: string; taskId?: string };
    const record = store.assessments.get(params.id);
    if (!record || record.session.user_id !== user(request)) throw new HttpProblem(404, 'NOT_FOUND');
    await expire(record);
    return record;
  }
  const active = (record: AssessmentRecord) => {
    if (record.session.status !== 'active' || now() >= Date.parse(record.session.expires_at)) throw new HttpProblem(409, 'ASSESSMENT_FINISHED');
    if (record.generation && (record.generation.status !== 'ready' || !certified(record))) throw new HttpProblem(409, 'ASSESSMENT_GENERATING');
    if (record.operation) throw new HttpProblem(409, 'EXECUTION_IN_PROGRESS');
    if (record.events.length >= 900) throw new HttpProblem(429, 'EVENT_LIMIT');
  };
  const state = (record: AssessmentRecord) => {
    const reached = TIER_ORDER.filter(tier =>
      TIER_ORDER.indexOf(tier) <=
      TIER_ORDER.indexOf(record.session.current_tier)
    );
    const questions = reached.flatMap(tier =>
      works(record, tier).map(w => ({
        task_id: publicId(record, w.task.task_id),
        assistant_enabled: w.task.tier !== 'novice',
      }))
    );
    return {
      assessment_id: record.session.id,
      report_id: `report-${record.session.id}`,
      task_id: publicId(record, record.task.task_id),
      available_task_ids: record.generation && (record.generation.status!=='ready'||!certified(record)) ? [] : questions.map(q => q.task_id),
      questions: record.generation && (record.generation.status!=='ready'||!certified(record)) ? [] : questions,
      unlock_available: canUnlock(record),
      unlocks_used: TIER_ORDER.indexOf(record.session.current_tier),
      ...(record.generation ? {generation:{
        status: record.generation.status==='ready'&&!certified(record)?'queued' as const:record.generation.status,
        progress: {}, receipts: record.generation.receipts,
        ...(record.generation.source?{source:record.generation.source}:{}),
        verification:{policy:VALIDATION_POLICY,semantic_verified:certified(record)&&record.generation.status==='ready'},
      }} : {}),
      status: record.session.status,
      started_at: record.session.started_at,
      expires_at: record.session.expires_at,
      remaining_sec: Math.max(0, Math.min(3600,
        Math.ceil((Date.parse(record.session.expires_at) - now()) / 1000))),
      policy_todos: [],
      runner: options.runner_status?.runner ?? options.runner ?? 'immutable_seed_only',
      runner_available: options.runner_status?.available ?? true,
      ...(options.runner_status?.image ? { runner_image: options.runner_status.image } : {}),
      ...(record.auto_submit_error ? { auto_submit_error: record.auto_submit_error } : {}),
    };
  };

  app.post('/portfolio', { bodyLimit: 1_048_576, schema: { response: { 200: PortfolioResponse, ...errors } } }, async (request, reply) => {
    const parsed = parsePortfolioDetailed(request.body);
    if ('errors' in parsed) return reply.code(422).send({ error: { code: 'INVALID_PORTFOLIO', message: 'Invalid portfolio', request_id: request.id, fields: parsed.errors } });
    if (!store.profiles.has(user(request)) && store.profiles.size >= store.max_profiles) throw new HttpProblem(429, 'STORE_CAPACITY');
    store.profiles.set(user(request), { profile: structuredClone(parsed.profile), portfolio: request.body, reuploaded: true });
    return { profile: parsed.profile, warnings: parsed.warnings, injection_flags: parsed.injection_flags };
  });
  const profileFor = (request: FastifyRequest) => {
    const profile = store.profiles.get(user(request));
    if (!profile) throw new HttpProblem(409, 'PORTFOLIO_REQUIRED');
    return profile;
  };
  app.get('/onboarding-quiz', { schema: { response: { 200: QuizResponse, ...errors } } }, async request => {
    const result = real(ports.quiz({ profile: profileFor(request).profile }));
    if (!('questions' in result)) throw new Error('Quiz result mismatch');
    return result;
  });
  app.post<{ Body: { answers: { question_id: string; option_id: string }[] } }>('/onboarding-quiz', { schema: { body: QuizAnswers, response: { 200: FocusLaneResponse, ...errors } } }, async request => {
    const stored = profileFor(request);
    const offered = real(ports.quiz({ profile: stored.profile }));
    if (!('questions' in offered)) throw new Error('Quiz result mismatch');
    if (new Set(request.body.answers.map(a => a.question_id)).size !== request.body.answers.length || request.body.answers.some(a => !offered.questions.some(q => q.id === a.question_id && q.options.some(o => o.id === a.option_id)))) throw new HttpProblem(400, 'INVALID_QUIZ_ANSWER');
    const result = real(ports.quiz({ profile: stored.profile, answers: request.body.answers }));
    if (!('focus_lane' in result)) throw new Error('Quiz result mismatch');
    stored.focus_lane = result.focus_lane;
    return result;
  });
  app.post('/assessments', { schema: { body: empty, response: { 201: AssessmentState, ...errors } } }, async (request, reply) => {
    const stored = profileFor(request);
    if (!seed.dsa_topics.every(t => stored.profile.claimed_topics.includes(t))) throw new HttpProblem(422, 'SEED_TOPIC_UNAVAILABLE');
    for (const record of store.assessments.values()) if (record.session.user_id === user(request)) {
      await expire(record);
      if (record.session.status === 'active') throw new HttpProblem(409, 'ASSESSMENT_ACTIVE');
    }
    if (store.assessments.size >= store.max_assessments) throw new HttpProblem(429, 'STORE_CAPACITY');
    const started = now();
    const record: AssessmentRecord = { profile_snapshot: structuredClone(stored.profile), session: { id: randomUUID(), user_id: user(request), started_at: new Date(started).toISOString(), expires_at: new Date(started + 3600000).toISOString(), current_tier: 'novice', status: 'active' }, task: structuredClone(seed), files: structuredClone(seed.files), events: [], runs: [], hint_level: 0,
      tier_work: {
        novice: {
          task: structuredClone(seed),
          files: structuredClone(seed.files),
          hint_level: 0,
        },
      },
      unlocked_tiers: ['novice'],
    };
    const additionalNovice = (options.seed_bank?.novice ?? [])
      .filter(task =>
        task.task_id !== seed.task_id &&
        task.dsa_topics.every(topic =>
          stored.profile.claimed_topics.includes(topic)
        )
      );

    record.question_sets = {
      novice: [
        record.tier_work!.novice!,
        ...additionalNovice.map(task => ({
          task: structuredClone(task),
          files: structuredClone(task.files),
          hint_level: 0,
        })),
      ],
    };

    for (const tier of TIER_ORDER) {
      if (tier === 'novice') continue;

      // One reviewed fallback question per higher set: the first compatible seed in bank
      // order, so richer claimed topics (hashing, sliding_window) keep their own family and
      // arrays-only families cover every other portfolio.
      const selected = (options.seed_bank?.[tier] ?? []).filter(candidate =>
        candidate.dsa_topics.every(topic =>
          stored.profile.claimed_topics.includes(topic)
        )
      ).slice(0, 1);

      if (!selected.length) continue;

      record.question_sets[tier] = selected.map(task => ({
        task: structuredClone(task),
        files: structuredClone(task.files),
        hint_level: 0,
      }));
      record.tier_work![tier] = record.question_sets[tier]![0]!;
    }

    if (store.durable) { record.generation = { status: 'queued', progress: {}, receipts: [] }; record.profile_snapshot = structuredClone(stored.profile); record.portfolio_snapshot = structuredClone(stored.portfolio); record.focus_snapshot = structuredClone(stored.focus_lane ?? { domain: stored.profile.domain, skills: stored.profile.skills, topics: stored.profile.claimed_topics }); }
    store.assessments.set(record.session.id, record);
    reply.code(201);
    return state(record);
  });
  app.get('/assessments/:id/status', { schema: { response: { 200: AssessmentState, ...errors } } }, async request => state(await owned(request)));
  // Candidate finishes early (button, or the 3rd tab switch): close the session through the same
  // path as timer expiry, i.e. auto-submit saved files, session_end and the final report.
  app.post('/assessments/:id/finish', { schema: { body: empty, response: { 200: AssessmentState, ...errors } } }, async request => {
    const record = await owned(request);
    active(record);
    record.session.expires_at = new Date(Math.min(now(), Date.parse(record.session.expires_at))).toISOString();
    await expire(record);
    return state(record);
  });
  app.post('/assessments/:id/tier/upgrade', {
    schema: { body: empty, response: { 200: AssessmentState, ...errors } },
  }, async request => {
    const record = await owned(request);
    active(record);

    const from = record.session.current_tier;
    const to = nextTier(from);

    if (!to || !canUnlock(record))
      throw new HttpProblem(409, 'UNLOCK_NOT_AVAILABLE');

    const nextWork = works(record, to)[0]!;

    record.tier_work ??= {};
    const previous = works(record, from)[0];
    if (previous) record.tier_work[from] = previous;

    record.task = structuredClone(nextWork.task);
    record.files = structuredClone(nextWork.files);
    record.hint_level = nextWork.hint_level;
    record.session.current_tier = to;

    record.unlocked_tiers ??= ['novice'];
    record.unlocked_tiers.push(to);
    const unlocks_used = TIER_ORDER.indexOf(to);

    emit(record, 'tier_unlocked', { unlocks_used });
    emit(record, 'tier_upgraded', { unlocks_used });
    return state(record);
  });

  app.get('/assessments/:id/tasks/:taskId', { schema: { response: { 200: CandidateTask, ...errors } } }, async request => {
    const record = await owned(request, true);
    const work = taskWork(record, (request.params as { taskId: string }).taskId);
    const { tier: _tier, ...candidate } =
      publicTask({ ...work.task, files: work.files });
    return {
      ...candidate,
      task_id: publicId(record, work.task.task_id),
      assistant_enabled: work.task.tier !== 'novice',
    };
  });
  app.put<{ Body: { files: File[] } }>('/assessments/:id/tasks/:taskId/files', { schema: { body: TaskFilesRequest, response: { 200: ok, ...errors } } }, async request => {
    const record = await owned(request, true); active(record);
    const work = taskWork(record, (request.params as { taskId: string }).taskId);
    work.files = checkedFiles(work, request.body.files);
    syncCurrent(record, work);
    emit(record, 'file_edit_snapshot',
      { files_hash: hashEditableFiles(work.files) },
      now(), 'server', work.task.task_id);
    return { ok: true };
  });
  for (const mode of ['run', 'submit'] as const) app.post<{ Body: { files?: File[] } }>(`/assessments/:id/tasks/:taskId/${mode}`, { schema: { body: RunFilesRequest, response: { 200: RunResult, ...errors } } }, async request => {
    const record = await owned(request, true); active(record);
    const work = taskWork(record, (request.params as { taskId: string }).taskId);
    if (request.body.files) {
      work.files = checkedFiles(work, request.body.files);
      syncCurrent(record, work);
    }
    const result = publicRun(await execute(record, work, mode));
    return { ...result, task_id: publicId(record, work.task.task_id) };
  });
  const taskSelector = Type.Object({
    task_id: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  }, { additionalProperties: false });

  app.post<{ Body: { task_id?: string } }>(
    '/assessments/:id/hint',
    { schema: { body: taskSelector, response: { 200: HintResponse, ...errors } } },
    async request => {
      const record = await owned(request);
      active(record);
      const work = taskWork(record, request.body.task_id ?? record.task.task_id);

      if (work.task.tier === 'novice')
        throw new HttpProblem(403, 'ASSISTANCE_DISABLED');
      if (record.hint_pending) throw new HttpProblem(409, 'HINT_IN_PROGRESS');
      if (work.hint_level >= 3) throw new HttpProblem(409, 'HINTS_EXHAUSTED');

      const level = (work.hint_level + 1) as 1 | 2 | 3;
      record.hint_pending = true;
      try {
        const provider = createHintProvider(async taskId =>
          taskId === work.task.task_id ? work.task.hint_ladder : null
        );
        const hint = real(await provider(
          { task_id: work.task.task_id, level },
          { signal: AbortSignal.any([closing.signal, AbortSignal.timeout(5000)]) }
        ));
        work.hint_level = level;
        syncCurrent(record, work);
        emit(record, 'hint_request', { level }, now(), 'server', work.task.task_id);
        emit(record, 'hint_served', { level }, now(), 'server', work.task.task_id);
        return hint;
      } finally {
        delete record.hint_pending;
      }
    }
  );

  const assistantBody = Type.Object({
    task_id: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    message: Type.String({ minLength: 1, maxLength: 2000 }),
    history: Type.Optional(Type.Array(Type.Object({
      role: Type.Union([Type.Literal('user'), Type.Literal('assistant')]),
      content: Type.String({ maxLength: 2000 }),
    }, { additionalProperties: false }), { maxItems: 12 })),
  }, { additionalProperties: false });

  app.post<{
    Body: {
      task_id?: string;
      message: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };
  }>('/assessments/:id/assistant', {
    schema: { body: assistantBody, response: { 200: AssistantResponse, ...errors } },
  }, async request => {
    const record = await owned(request);
    active(record);
    const work = taskWork(record, request.body.task_id ?? record.task.task_id);

    if (work.task.tier === 'novice')
      throw new HttpProblem(403, 'ASSISTANCE_DISABLED');

    const used = record.events.filter(event =>
      event.task_id === work.task.task_id &&
      (event.type === 'assistant_message' || event.type === 'assistant_blocked')
    ).length;
    if (used >= 10) throw new HttpProblem(429, 'ASSISTANT_LIMIT');

    if (record.assistant_pending)
      throw new HttpProblem(409, 'ASSISTANT_IN_PROGRESS');
    record.assistant_pending = true;

    try {
      const latest = record.runs.filter(r =>
        r.task_id === work.task.task_id
      ).at(-1);
      const failures = (latest?.tests ?? [])
        .filter(t => t.visibility === 'visible' && t.status !== 'pass')
        .map(t => ({
          id: t.id,
          status: t.status,
          duration_ms: t.duration_ms,
        }));

      const guarded = createAssistant({
        chat: ports.chat,
        referenceFiles: async id =>
          id === work.task.task_id
            ? structuredClone(work.task.reference_files) : null,
        onEvent: event => emit(
          record, event.type, event.payload,
          now(), 'server', event.task_id
        ),
      });

      const answer = await guarded({
        task: publicTask({ ...work.task, files: work.files }),
        files: structuredClone(work.files),
        visible_failures: failures,
        message: request.body.message,
        history: request.body.history ?? [],
      }, {
        signal: AbortSignal.any([closing.signal, AbortSignal.timeout(8500)]),
      });

      if (answer.kind !== 'ok')
        throw new HttpProblem(503, 'LLM_UNAVAILABLE');

      if (answer.value.blocked) return answer.value;
      return {
        ...answer.value,
        reply: answer.value.reply.replace(
          /\b(?:novice|adept|master)\b/gi, 'current'
        ),
      };
    } finally {
      record.assistant_pending = false;
    }
  });

  app.post<{ Body: { events: { task_id: string; client_ts: string; type: 'tab_hidden' | 'tab_visible' | 'copy' | 'paste' | 'window_blur' | 'fullscreen_exit' | 'page_reload'; payload: { size?: number; duration_ms?: number } }[] } }>('/assessments/:id/events', { schema: { body: EventsRequest, response: { 200: ok, ...errors } } }, async request => {
    const record = await owned(request); active(record);
    for (const event of request.body.events) {
      try { taskWork(record, event.task_id); }
      catch { throw new HttpProblem(400, 'INVALID_TASK'); }
    }
    if (record.events.length + request.body.events.length > 900) throw new HttpProblem(429, 'EVENT_LIMIT');
    for (const event of request.body.events)
      emit(record, event.type, { ...event.payload, client_ts: event.client_ts },
        now(), 'client', event.task_id);
    return { ok: true };
  });
  function buildReport(record: AssessmentRecord) {
    const tasks = TIER_ORDER.flatMap(tier => works(record, tier).map(w => w.task));
    for (const task of tasks) if (task.tier !== 'novice') real(ports.calculateAie({ events: record.events, runs: record.runs, task }));
    return real(ports.buildReport({ session: record.session, tasks, runs: record.runs, events: record.events, profile: record.profile_snapshot ?? store.profiles.get(record.session.user_id)?.profile }));
  }
  app.get<{Querystring:{before?:string}}>('/reports', { schema: { querystring:Type.Object({before:Type.Optional(Id)},{additionalProperties:false}), response: { 200: ReportHistory, ...errors } } }, async request => {
    const rows=await store.reportHistory(request.query.before);
    return {reports:rows.slice(0,100),...(rows.length>100?{next_cursor:rows[99]!.id}:{})};
  });
  app.get('/reports/:id', { schema: { response: { 200: Report, ...errors } } }, async request => {
    const reportId = (request.params as { id: string }).id;
    const record = reportId.startsWith('report-') ? store.assessments.get(reportId.slice(7)) : undefined;
    if (!record || record.session.user_id !== user(request)) throw new HttpProblem(404, 'NOT_FOUND');
    await expire(record);
    if(record.generation?.status==='failed')throw new HttpProblem(503,'TASK_VALIDATION_FAILED');
    if(record.session.status==='active'&&record.generation&&!certified(record))throw new HttpProblem(409,'ASSESSMENT_GENERATING');
    const saved = record.session.status === 'finished' ? await store.readReport(reportId) : undefined;
    const report = saved ?? buildReport(record);
    store.saveReport(record.session.id, report);
    return report;
  });
}
