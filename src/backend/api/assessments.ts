import { randomUUID } from 'node:crypto';
import { TIER_ORDER, finalSubmitPassed, nextTier } from './tier-policy.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import { ApiError, AssessmentState, EventsRequest, FocusLaneResponse, HintResponse, PortfolioResponse, QuizAnswers, QuizResponse, Report, RunFilesRequest, RunResult, Task, TaskFilesRequest } from '@torquecode/contracts';
import type { File } from '@torquecode/contracts';
import type { Event, InternalRunResult, PrivateTask, SeamResult } from '../contracts/internal.js';
import type { Ports } from '../contracts/seams.js';
import { parsePortfolioDetailed } from '../intake/portfolio.js';
import { hashEditableFiles } from '../scoring/aie.js';
import { AssessmentStore, type AssessmentRecord } from './assessment-store.js';
import type { RunnerStatus } from './runner-status.js';
import { HttpProblem } from './errors.js';
import { publicRun, publicTask } from './public-projections.js';

export type AssessmentOptions = {
  store: AssessmentStore; seed: PrivateTask; origin: string;
  authenticate: (request: FastifyRequest) => Promise<string | undefined>;
  now?: () => number; runner?: 'immutable_seed_only' | 'isolated'; runner_status?: RunnerStatus;
};
const empty = Type.Object({}, { additionalProperties: false });
const ok = Type.Object({ ok: Type.Literal(true) }, { additionalProperties: false });
const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError, 413: ApiError, 422: ApiError, 429: ApiError, 500: ApiError, 503: ApiError };
function real<T>(result: SeamResult<T>): T {
  if (result.kind !== 'ok') throw new HttpProblem(503, result.kind === 'unavailable' ? result.code : 'FIXTURE_UNAVAILABLE');
  return result.value;
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
  const user = (request: FastifyRequest) => identities.get(request)!;
  const emit = (record: AssessmentRecord, type: Event['type'], payload: Event['payload'], ts = now(), source: Event['source'] = 'server') => {
    record.events.push({ session_id: record.session.id, task_id: record.task.task_id, ts: new Date(ts).toISOString(), type, source, payload });
  };
  function checkedFiles(record: AssessmentRecord, files: File[]): File[] {
    const editable = record.task.files.filter(file => file.editable);
    if (files.length !== editable.length || new Set(files.map(f => f.path)).size !== files.length) throw new HttpProblem(400, 'INVALID_FILES');
    if (files.some(file => !editable.some(expected => expected.path === file.path))) throw new HttpProblem(400, 'INVALID_FILES');
    return record.task.files.map(expected => {
      if (!expected.editable) return { ...expected };
      const supplied = files.find(f => f.path === expected.path);
      if (!supplied || supplied.editable !== true) throw new HttpProblem(400, 'INVALID_FILES');
      return { path: expected.path, content: supplied.content, editable: true };
    });
  }
  async function execute(record: AssessmentRecord, mode: 'run' | 'submit', ts = now()): Promise<InternalRunResult> {
    if (record.operation) throw new HttpProblem(409, 'EXECUTION_IN_PROGRESS');
    if (executions >= 2) throw new HttpProblem(429, 'RUNNER_BUSY');
    if (record.runs.length >= 100) throw new HttpProblem(429, 'RUN_LIMIT');
    const files = structuredClone(record.files);
    const files_hash = hashEditableFiles(files);
    executions++;
    const operation = (async () => {
      const context = { signal: AbortSignal.any([closing.signal, AbortSignal.timeout(record.task.limits.wall_time_ms + 1000)]) };
      const outcome = await ports.runTests({ task_id: record.task.task_id, files, tests: structuredClone(record.task.tests), limits: { ...record.task.limits }, mode }, context);
      if (outcome.kind === 'unavailable') {
        if (options.runner_status?.runner === 'isolated') options.runner_status.available = false;
        throw new HttpProblem(503, 'SANDBOX_UNAVAILABLE');
      }
      const result = real(outcome);
      // Validate identity/mode before associating a runner result with this user/session.
      if (result.task_id !== record.task.task_id || result.mode !== mode) throw new Error('Runner result mismatch');
      publicRun(result); // Reject run-mode hidden results before storing/returning.
      if (options.runner_status?.runner === 'isolated') options.runner_status.available = true;
      record.runs.push(result);
      emit(record, mode, { run_id: result.run_id, files_hash }, ts);

      // K10: unlocking is earned by a fully passing final submission.
      // Never invent an unavailable next-tier task.
      if (
        mode === 'submit' &&
        record.session.status === 'active' &&
        now() < Date.parse(record.session.expires_at) &&
        finalSubmitPassed(record.runs, record.task.task_id)
      ) {
        const next = nextTier(record.session.current_tier);

        if (
          next &&
          record.tier_work?.[next] &&
          !record.unlocked_tiers?.includes(next)
        ) {
          record.unlocked_tiers ??= ['novice'];
          record.unlocked_tiers.push(next);
          emit(record, 'tier_unlocked', {
            from: record.session.current_tier,
            to: next,
          }, ts);
        }
      }

      return result;
    })();
    record.operation = operation;
    try { return await operation; }
    finally { delete record.operation; executions--; }
  }
  async function expire(record: AssessmentRecord): Promise<void> {
    if (now() < Date.parse(record.session.expires_at)) return;
    if (record.expiry) return record.expiry;
    record.session.status = 'finished';
    const expiry = (async () => {
      try {
        if (record.operation) await record.operation.catch(() => undefined);
        await execute(record, 'submit', Date.parse(record.session.expires_at));
      } catch (error) { record.auto_submit_error = error instanceof HttpProblem ? error.code : 'AUTO_SUBMIT_FAILED'; }
      emit(record, 'session_end', { reason: 'expired', ...(record.auto_submit_error ? { auto_submit_error: record.auto_submit_error } : {}) }, Date.parse(record.session.expires_at));
    })();
    record.expiry = expiry;
    return expiry;
  }
  const timer = setInterval(() => {
    for (const record of store.assessments.values()) if (!record.expiry && now() >= Date.parse(record.session.expires_at)) void expire(record);
  }, 1000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer); closing.abort();
    await Promise.allSettled([...store.assessments.values()].flatMap(r => [r.operation, r.expiry].filter(p => p !== undefined)));
  });
  async function owned(request: FastifyRequest, task = false) {
    const params = request.params as { id: string; taskId?: string };
    const record = store.assessments.get(params.id);
    if (!record || record.session.user_id !== user(request) || (task && params.taskId !== record.task.task_id)) throw new HttpProblem(404, 'NOT_FOUND');
    await expire(record);
    return record;
  }
  const active = (record: AssessmentRecord) => {
    if (record.session.status !== 'active' || now() >= Date.parse(record.session.expires_at)) throw new HttpProblem(409, 'ASSESSMENT_FINISHED');
    if (record.operation) throw new HttpProblem(409, 'EXECUTION_IN_PROGRESS');
    if (record.events.length >= 900) throw new HttpProblem(429, 'EVENT_LIMIT');
  };
  const state = (record: AssessmentRecord) => ({
    assessment_id: record.session.id, report_id: `report-${record.session.id}`, task_id: record.task.task_id,
    current_tier: record.session.current_tier, status: record.session.status,
    unlocked_tiers: record.unlocked_tiers ?? ['novice'],
    tiers: TIER_ORDER.map(tier => {
      const work = record.tier_work?.[tier];
      const unlocked = (record.unlocked_tiers ?? ['novice']).includes(tier);
      return {
        tier,
        availability: work ? 'available' as const : 'unavailable' as const,
        unlocked,
        ...(work && unlocked ? { task_id: work.task.task_id } : {}),
      };
    }),
    started_at: record.session.started_at, expires_at: record.session.expires_at,
    remaining_sec: Math.max(0, Math.min(3600, Math.ceil((Date.parse(record.session.expires_at) - now()) / 1000))),
    policy_todos: ['OPEN-Q1', 'OPEN-Q4'], runner: options.runner_status?.runner ?? options.runner ?? 'immutable_seed_only',
    runner_available: options.runner_status?.available ?? true,
    ...(options.runner_status?.image ? { runner_image: options.runner_status.image } : {}),
    ...(record.auto_submit_error ? { auto_submit_error: record.auto_submit_error } : {}),
  });
  app.post('/portfolio', { bodyLimit: 1_048_576, schema: { response: { 200: PortfolioResponse, ...errors } } }, async (request, reply) => {
    const parsed = parsePortfolioDetailed(request.body);
    if ('errors' in parsed) return reply.code(422).send({ error: { code: 'INVALID_PORTFOLIO', message: 'Invalid portfolio', request_id: request.id, fields: parsed.errors } });
    if (!store.profiles.has(user(request)) && store.profiles.size >= store.max_profiles) throw new HttpProblem(429, 'STORE_CAPACITY');
    store.profiles.set(user(request), { profile: structuredClone(parsed.profile) });
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
    const record: AssessmentRecord = { session: { id: randomUUID(), user_id: user(request), started_at: new Date(started).toISOString(), expires_at: new Date(started + 3600000).toISOString(), current_tier: 'novice', status: 'active' }, task: structuredClone(seed), files: structuredClone(seed.files), events: [], runs: [], hint_level: 0,
      tier_work: {
        novice: {
          task: structuredClone(seed),
          files: structuredClone(seed.files),
          hint_level: 0,
        },
      },
      unlocked_tiers: ['novice'],
    };
    // TODO(OPEN-Q1): no guessed unlock/upgrade policy; seed Novice only.
    store.assessments.set(record.session.id, record);
    return reply.code(201).send(state(record));
  });
  app.get('/assessments/:id/status', { schema: { response: { 200: AssessmentState, ...errors } } }, async request => state(await owned(request)));
  app.post('/assessments/:id/tier/upgrade', {
    schema: { body: empty, response: { 200: AssessmentState, ...errors } },
  }, async request => {
    const record = await owned(request);
    active(record);

    const from = record.session.current_tier;
    const to = nextTier(from);

    if (!to) throw new HttpProblem(409, 'NO_HIGHER_TIER');
    if (!record.unlocked_tiers?.includes(to))
      throw new HttpProblem(409, 'TIER_LOCKED');

    const nextWork = record.tier_work?.[to];
    if (!nextWork) throw new HttpProblem(409, 'TIER_UNAVAILABLE');

    record.tier_work ??= {};
    record.tier_work[from] = {
      task: record.task,
      files: structuredClone(record.files),
      hint_level: record.hint_level,
    };

    record.task = structuredClone(nextWork.task);
    record.files = structuredClone(nextWork.files);
    record.hint_level = nextWork.hint_level;
    record.session.current_tier = to;

    emit(record, 'tier_upgraded', { from, to });
    return state(record);
  });

  app.get('/assessments/:id/tasks/:taskId', { schema: { response: { 200: Task, ...errors } } }, async request => {
    const record = await owned(request, true);
    return publicTask({ ...record.task, files: record.files });
  });
  app.put<{ Body: { files: File[] } }>('/assessments/:id/tasks/:taskId/files', { schema: { body: TaskFilesRequest, response: { 200: ok, ...errors } } }, async request => {
    const record = await owned(request, true); active(record);
    record.files = checkedFiles(record, request.body.files);
    emit(record, 'file_edit_snapshot', { files_hash: hashEditableFiles(record.files) });
    return { ok: true };
  });
  for (const mode of ['run', 'submit'] as const) app.post<{ Body: { files?: File[] } }>(`/assessments/:id/tasks/:taskId/${mode}`, { schema: { body: RunFilesRequest, response: { 200: RunResult, ...errors } } }, async request => {
    const record = await owned(request, true); active(record);
    if (request.body.files) record.files = checkedFiles(record, request.body.files);
    return publicRun(await execute(record, mode));
  });
  app.post('/assessments/:id/hint', { schema: { body: empty, response: { 200: HintResponse, ...errors } } }, async request => {
    const record = await owned(request); active(record);
    if (record.hint_pending) throw new HttpProblem(409, 'HINT_IN_PROGRESS');
    if (record.hint_level >= 3) throw new HttpProblem(409, 'HINTS_EXHAUSTED');
    const level = (record.hint_level + 1) as 1 | 2 | 3;
    record.hint_pending = true;
    try {
    emit(record, 'hint_request', { level });
    const hint = real(await ports.nextHint({ task_id: record.task.task_id, level }, { signal: AbortSignal.any([closing.signal, AbortSignal.timeout(5000)]) }));
    if (hint.level !== level) throw new Error('Hint result mismatch');
    record.hint_level = level; emit(record, 'hint_served', { level });
    return hint;
    } finally { delete record.hint_pending; }
  });
  app.post<{ Body: { events: { task_id: string; client_ts: string; type: 'tab_hidden' | 'tab_visible' | 'copy' | 'paste'; payload: { size?: number } }[] } }>('/assessments/:id/events', { schema: { body: EventsRequest, response: { 200: ok, ...errors } } }, async request => {
    const record = await owned(request); active(record);
    if (request.body.events.some(e => e.task_id !== record.task.task_id)) throw new HttpProblem(400, 'INVALID_TASK');
    if (record.events.length + request.body.events.length > 900) throw new HttpProblem(429, 'EVENT_LIMIT');
    for (const event of request.body.events) emit(record, event.type, { ...event.payload, client_ts: event.client_ts }, now(), 'client');
    return { ok: true };
  });
  app.get('/reports/:id', { schema: { response: { 200: Report, ...errors } } }, async request => {
    const reportId = (request.params as { id: string }).id;
    const record = reportId.startsWith('report-') ? store.assessments.get(reportId.slice(7)) : undefined;
    if (!record || record.session.user_id !== user(request)) throw new HttpProblem(404, 'NOT_FOUND');
    await expire(record);
    // calculateAie is wired independently for later tiers; Novice remains the report owner's TODO(OPEN-Q4).
    const tasks = [record.task];
    for (const task of tasks) if (task.tier !== 'novice') real(ports.calculateAie({ events: record.events, runs: record.runs, task }));
    return real(ports.buildReport({ session: record.session, tasks, runs: record.runs, events: record.events }));
  });
}
