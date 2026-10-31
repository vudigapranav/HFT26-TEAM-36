// End-to-end check of a running deployment over real HTTP (cookie session, PostgreSQL, Docker runner).
// Run via deploy/verify.sh, which loads deploy/.env. Creates a throwaway account; prints a JSON summary.
//   --outage   also start a second backend whose Docker daemon is unreachable and prove a Run
//              returns 503 with no grade.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'backend');
const port = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 3001);
const origin = process.env.AUTH_ORIGIN ?? 'http://127.0.0.1:4177';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), ...(detail ? { detail } : {}) });
  if (!ok) throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
};

function client(base) {
  let cookie = '';
  return async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method, signal: AbortSignal.timeout(120_000),
      headers: { origin, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, json, text };
  };
}

async function account(call) {
  const email = `verify-${randomUUID().slice(0, 8)}@example.com`;
  const password = `Verify-${randomUUID()}`;
  const registered = await call('POST', '/auth/register', { email, password });
  // 429 = the auth rate limiter (per IP): expected after several verify runs in a few minutes.
  check('register', registered.status === 201, `HTTP ${registered.status}${registered.status === 429 ? ' (rate limited: wait and retry)' : ''}`);
  const login = await call('POST', '/auth/login', { email, password });
  check('login sets a session', login.status === 200, `HTTP ${login.status}`);
  const me = await call('GET', '/auth/me');
  check('session identifies the user', me.status === 200 && me.json?.user?.email === email);
}

const read = path => readFileSync(join(backend, path), 'utf8').replaceAll('\r\n', '\n');
// The demo portfolio (docs/demo, Pranav's P10) when present, else the intake test fixture.
const demoPortfolio = join(backend, '..', '..', 'docs', 'demo', 'demo-portfolio.json');
const portfolioJson = () => JSON.parse(existsSync(demoPortfolio) ? readFileSync(demoPortfolio, 'utf8') : read('tests/fixtures/portfolios/normal-web.json'));
const PRIVATE = [/reference_files/, /hint_ladder/, /test_hidden/, /f2p_ids/, /p2p_ids/];
const noPrivate = (name, text) => check(`${name}: no private task data`, !PRIVATE.some(p => p.test(text)));

// Since K11 questions are released only after the generation job verifies them (POST /assessments returns
// generation.status "queued" and GET .../tasks answers 409 ASSESSMENT_GENERATING until then).
const BUSY = new Set(['queued', 'generating', 'validating']);
async function released(call, created, limitMs = 300_000) {
  let state = created;
  const deadline = Date.now() + limitMs;
  while (state.generation && BUSY.has(state.generation.status) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    const status = await call('GET', `/assessments/${created.assessment_id}/status`);
    if (status.status !== 200) throw new Error(`assessment status failed: HTTP ${status.status}`);
    state = status.json;
  }
  return state;
}

async function journey(base) {
  const call = client(base);
  const health = await call('GET', '/health');
  check('health ok with Docker runner available', health.status === 200 && health.json?.status === 'ok' && health.json?.runner_available === true, health.text);
  await account(call);
  const uploaded = await call('POST', '/portfolio', portfolioJson());
  check('portfolio accepted', uploaded.status === 200, uploaded.text.slice(0, 200));
  const quiz = await call('GET', '/onboarding-quiz');
  check('quiz questions', quiz.status === 200 && quiz.json.questions.length > 0);
  const answers = quiz.json.questions.map(q => ({ question_id: q.id, option_id: q.options[0].id }));
  check('quiz answered', (await call('POST', '/onboarding-quiz', { answers })).status === 200);
  const created = await call('POST', '/assessments', {});
  check('assessment created', created.status === 201, created.text.slice(0, 200));
  const started = Date.now();
  const ready = await released(call, created.json);
  check('questions released after verification', !ready.generation || ready.generation.status === 'ready', JSON.stringify(ready.generation ?? {}).slice(0, 300));
  check(`generation took ${Math.round((Date.now() - started) / 1000)} s`, true);
  const { assessment_id: id, task_id: taskId, report_id: reportId } = ready;
  const task = await call('GET', `/assessments/${id}/tasks/${taskId}`);
  check('task served', task.status === 200);
  noPrivate('task', task.text);
  const editable = task.json.files.filter(f => f.editable);

  const run = await call('POST', `/assessments/${id}/tasks/${taskId}/run`, { files: editable });
  check('run starter in Docker', run.status === 200 && run.json.hidden === null && run.json.visible.some(t => t.status === 'fail'), run.text.slice(0, 300));
  noPrivate('run', run.text);

  // The fix for the seed task, written by the "candidate" (this script knows the public bug only).
  const fixed = editable.map(f => ({ ...f, content: f.content.replace('range(len(counts) - 1)', 'range(len(counts))') }));
  const submit = await call('POST', `/assessments/${id}/tasks/${taskId}/submit`, { files: fixed });
  check('submit fixed code in Docker', submit.status === 200 && submit.json.passed === submit.json.total && submit.json.hidden?.total > 0, submit.text.slice(0, 300));
  check('submit hides output', submit.json.stdout === '' && submit.json.stderr === '');
  noPrivate('submit', submit.text);

  const hint = await call('POST', `/assessments/${id}/hint`, {});
  check('hint endpoint answers (200, or 403 where the tier has no AI)', hint.status === 200 || hint.status === 403, `${hint.status}`);
  const report = await call('GET', `/reports/${reportId}`);
  check('report', report.status === 200 && Array.isArray(report.json.tasks), report.text.slice(0, 200));
  noPrivate('report', report.text);

  const stranger = client(base);
  await account(stranger);
  check('another user cannot read this report', (await stranger('GET', `/reports/${reportId}`)).status === 404);
  check('another user cannot read this assessment', (await stranger('GET', `/assessments/${id}/status`)).status === 404);
  return { assessment_id: id, task_id: taskId, passed: submit.json.passed, total: submit.json.total };
}

async function outage() {
  const outagePort = port + 1;
  const child = spawn(process.execPath, ['dist/api/server.js'], {
    cwd: backend, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(outagePort), DOCKER_HOST: 'tcp://127.0.0.1:9' }, // unreachable daemon
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  try {
    const base = `http://127.0.0.1:${outagePort}`;
    const call = client(base);
    let health = null;
    for (let i = 0; i < 60 && !health; i++) {
      try { health = await call('GET', '/health'); } catch { await new Promise(r => setTimeout(r, 1000)); }
    }
    check('outage backend starts', health?.status === 200, log.slice(-300));
    check('outage: health reports runner unavailable', health.json.runner_available === false, health.text);
    await account(call);
    await call('POST', '/portfolio', portfolioJson());
    const quiz = await call('GET', '/onboarding-quiz');
    await call('POST', '/onboarding-quiz', { answers: quiz.json.questions.map(q => ({ question_id: q.id, option_id: q.options[0].id })) });
    const created = await released(call, (await call('POST', '/assessments', {})).json);
    if (created.generation?.status === 'failed') {
      // Without a sandbox no question can be verified, so none is released and nothing is graded.
      const blocked = await call('GET', `/assessments/${created.assessment_id}/tasks/${created.task_id}`);
      check('outage: unverified questions are withheld', blocked.status !== 200, `${blocked.status}`);
      check('outage: no Docker host/socket text leaks', !/127\.0\.0\.1:9|docker\.sock|npipe|tcp:\/\//.test(JSON.stringify(created) + blocked.text));
    } else {
      const task = (await call('GET', `/assessments/${created.assessment_id}/tasks/${created.task_id}`)).json;
      const run = await call('POST', `/assessments/${created.assessment_id}/tasks/${created.task_id}/run`, { files: task.files.filter(f => f.editable) });
      check('outage: Run returns 503, not a grade', run.status === 503, `${run.status} ${run.text.slice(0, 200)}`);
      check('outage: no Docker host/socket text leaks', !/127\.0\.0\.1:9|docker\.sock|npipe|tcp:\/\//.test(run.text));
    }
    const report = await call('GET', `/reports/${created.report_id}`);
    // Either no report for an unverified assessment, or one with no graded run.
    check('outage: report has no graded run', report.status !== 200 || report.json.tasks.every(t => t.passed === 0), report.text.slice(0, 200));
  } finally {
    child.kill('SIGTERM');
  }
}

try {
  const summary = await journey(`http://127.0.0.1:${port}`);
  if (process.argv.includes('--outage')) await outage();
  console.log(JSON.stringify({ ok: true, ...summary, checks: results.length }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error.message, passed_checks: results.filter(r => r.ok).map(r => r.name) }, null, 2));
  process.exitCode = 1;
}
