// Optional runTests seam on E2B cloud sandboxes (RUNNER=e2b). Same trust boundary as the Docker runner (R3):
// - worker (UNTRUSTED) sandbox: the candidate's files + harness, runs worker.py;
// - grader (TRUSTED) sandbox: tests + pytest, runs grade.py; candidate modules are proxies;
// - this host relays one JSON line at a time between them with the same framing, size caps, id checks and
//   one-call-in-flight rule as dockerRunner.ts, and only the grader's own report decides the grade.
// Both sandboxes are created with allowInternetAccess:false and killed after every run.
//
// Differences from Docker, by design of the platform:
// - CPU/memory come from the template (e2bTemplate.ts), not per task; pids are not limited per run.
//   The candidate's wall_time_ms budget is enforced here exactly as in Docker.
// - Every relayed call crosses the network to E2B, so runs with many calls are slower than local Docker.
// - Hidden tests and candidate files are sent to E2B's sandboxes for the duration of the run.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { CommandExitError, Sandbox } from 'e2b';
import type { Context, InternalRunResult, RunRequest, SeamResult, TestResult } from '../contracts/internal.js';
import {
  HARNESS_FILES, MAX_CALLS, MAX_LINE_BYTES, TRUSTED_INI, candidateModules, capped, harnessDir, isObject, lineReader,
  parseReport, runnerAdmission, unavailable, validWorkerReply, validateRequest,
} from './dockerRunner.js';

export const DEFAULT_E2B_TEMPLATE = 'torquecode-runner-python';
const CLOUD_DOWN = 'Sandbox unavailable: the cloud sandbox service is not reachable';
const RUNNER_BUSY = 'Sandbox unavailable: runner busy, try again shortly';

/** The few sandbox operations the relay needs; the default implementation is E2B, tests inject a fake. */
export interface CloudProcess {
  sendStdin(data: string): Promise<void>;
  closeStdin(): Promise<void>;
  kill(): Promise<unknown>;
  /** Resolves with the exit code once the process ends (null if it can't be determined). */
  exited(): Promise<number | null>;
}
export interface CloudSandbox {
  write(files: { path: string; data: string }[]): Promise<unknown>;
  start(command: string, options: { cwd: string; envs?: Record<string, string>; timeoutMs: number;
    onStdout: (data: string) => void; onStderr: (data: string) => void }): Promise<CloudProcess>;
  kill(): Promise<unknown>;
}
export type CreateSandbox = (lifetimeMs: number) => Promise<CloudSandbox>;

export type E2BRunnerOptions = {
  template?: string;
  /** Infrastructure allowance (sandbox start, pytest collection) on top of the candidate's wall_time_ms. */
  startupBudgetMs?: number;
  create?: CreateSandbox;
};

function e2bSandboxes(template: string): CreateSandbox {
  return async lifetimeMs => {
    const sandbox = await Sandbox.create(template, { allowInternetAccess: false, timeoutMs: lifetimeMs + 30_000 });
    return {
      write: files => sandbox.files.write(files),
      async start(command, options) {
        const handle = await sandbox.commands.run(command, { ...options, background: true, stdin: true });
        return {
          sendStdin: data => handle.sendStdin(data),
          closeStdin: () => handle.closeStdin(),
          kill: () => handle.kill(),
          exited: () => handle.wait().then(result => result.exitCode,
            error => error instanceof CommandExitError ? error.exitCode : null),
        };
      },
      kill: () => sandbox.kill(),
    };
  };
}

// Paths are already validated by validateRequest (safe segments, no spaces or shell characters); quote anyway.
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export function createE2BRunner(options: E2BRunnerOptions = {}) {
  const template = options.template ?? process.env.E2B_TEMPLATE ?? DEFAULT_E2B_TEMPLATE;
  const startupBudgetMs = options.startupBudgetMs ?? 30_000;
  const create = options.create ?? e2bSandboxes(template);

  return async function runTests(input: RunRequest, context: Context): Promise<SeamResult<InternalRunResult>> {
    context.signal.throwIfAborted();
    const rejected = validateRequest(input);
    if (rejected) return unavailable(`Rejected run request: ${rejected}`);
    const modules = candidateModules(input.files);
    if (modules.length === 0) return unavailable('Rejected run request: no Python modules');
    const selected = input.tests.filter(test => input.mode === 'submit' || test.visibility === 'visible');
    if (selected.length === 0) return unavailable('Rejected run request: no tests selected');
    const expectedIds = selected.flatMap(test => test.ids);
    if (new Set(expectedIds).size !== expectedIds.length) return unavailable('Rejected run request: duplicate test ids');
    const visibility = new Map(selected.flatMap(test => test.ids.map(id => [id, test.visibility] as const)));
    const release = await runnerAdmission.acquire(context.signal);
    if (!release) return unavailable(RUNNER_BUSY);
    try { return await admitted(); } finally { release(); }

    async function admitted(): Promise<SeamResult<InternalRunResult>> {
      const { limits } = input;
      const lifetimeMs = limits.wall_time_ms + startupBudgetMs;
      const source = await harnessDir();
      const harness = await Promise.all(HARNESS_FILES.map(async name => ({ path: `/harness/${name}`, data: await readFile(join(source, name), 'utf8') })));
      const graderFiles = [
        ...harness,
        ...selected.map(test => ({ path: `/grade/${test.path}`, data: test.content })),
        { path: '/grade/pytest.ini', data: TRUSTED_INI },
        { path: '/grade/conftest.py', data: '' },
        ...[...new Set(selected.map(test => posix.dirname(test.path)))].filter(dir => dir !== '.').map(dir => ({ path: `/grade/${dir}/conftest.py`, data: '' })),
      ];
      const workerFiles = [...harness, ...input.files.map(file => ({ path: `/work/${file.path}`, data: file.content }))];

      const sandboxes: CloudSandbox[] = [];
      try {
        let worker: CloudSandbox, grader: CloudSandbox;
        try {
          const created = await Promise.allSettled([create(lifetimeMs), create(lifetimeMs)]);
          for (const result of created) if (result.status === 'fulfilled') sandboxes.push(result.value);
          if (sandboxes.length < 2) return unavailable(CLOUD_DOWN);
          [worker, grader] = sandboxes as [CloudSandbox, CloudSandbox];
          context.signal.throwIfAborted();
          await Promise.all([worker.write(workerFiles), grader.write(graderFiles)]);
        } catch (error) {
          if (context.signal.aborted) throw context.signal.reason ?? error;
          return unavailable(CLOUD_DOWN);
        }

        const graderOutput = capped(limits.output_bytes);
        const candidateOutput = capped(limits.output_bytes);
        const outcome = await relay({ worker, grader, modules, selected: selected.map(test => test.path), lifetimeMs,
          wallTimeMs: limits.wall_time_ms, signal: context.signal,
          onGraderStderr: data => graderOutput.push(Buffer.from(data)), onWorkerStderr: data => candidateOutput.push(Buffer.from(data)) });

        if (outcome.aborted) throw context.signal.reason ?? new Error('Aborted');
        if (outcome.startFailed) return unavailable(CLOUD_DOWN);
        const report = parseReport(outcome.report, expectedIds);
        const clean = !outcome.timedOut && !outcome.graderBroken && report !== null && (outcome.graderCode === 0 || outcome.graderCode === 1);
        // Not cleanly gradable and not the candidate's fault (no report, broken grader): no grade.
        if (!clean && !outcome.timedOut && report === null) return unavailable(CLOUD_DOWN);
        if (report?.unsupported) return unavailable('Task not supported by the isolated runner: tests must call candidate functions with plain data values');

        const graded = new Map<string, { status: TestResult['status']; duration_ms: number }>();
        for (const id of expectedIds) {
          const reported = outcome.timedOut ? undefined : report?.tests.get(id);
          graded.set(id, outcome.timedOut ? { status: 'timeout', duration_ms: 0 } : reported ?? { status: 'error', duration_ms: 0 });
        }
        // The grader is trusted, but a pass still needs its own exit code to agree.
        const allPassed = [...graded.values()].every(result => result.status === 'pass');
        if (allPassed && outcome.graderCode !== 0) for (const id of expectedIds) graded.set(id, { status: 'error', duration_ms: 0 });
        const tests = expectedIds.map(id => ({ id, ...graded.get(id)!, visibility: visibility.get(id)! }));
        return { kind: 'ok', value: {
          run_id: randomUUID(), task_id: input.task_id, mode: input.mode, tests,
          passed: tests.filter(test => test.status === 'pass').length, total: tests.length,
          stdout: graderOutput.text(), stderr: candidateOutput.text(), timed_out: outcome.timedOut,
        } };
      } finally {
        await Promise.allSettled(sandboxes.map(sandbox => sandbox.kill()));
      }
    }
  };
}

type RelayOutcome = {
  report: Record<string, unknown> | null; graderCode: number | null | undefined; workerCode: number | null | undefined;
  startFailed: boolean; timedOut: boolean; aborted: boolean; graderBroken: boolean;
  workerFault: 'WorkerDied' | 'ProtocolViolation' | null; candidateMs: number; calls: number;
};

/** The dockerRunner.ts relay, over cloud processes instead of `docker run -i` children. */
function relay(options: { worker: CloudSandbox; grader: CloudSandbox; modules: string[]; selected: string[]; lifetimeMs: number;
  wallTimeMs: number; signal: AbortSignal; onGraderStderr: (data: string) => void; onWorkerStderr: (data: string) => void }): Promise<RelayOutcome> {
  const { signal } = options;
  return new Promise(done => {
    const state: RelayOutcome = { report: null, graderCode: undefined, workerCode: undefined, startFailed: false,
      timedOut: false, aborted: false, graderBroken: false, workerFault: null, candidateMs: 0, calls: 0 };
    let workerProc: CloudProcess | null = null, graderProc: CloudProcess | null = null;
    let workerReady = false, workerClosed = false, finished = false;
    let pending: { id: number; sentAt: number; line: string } | null = null;
    let budgetTimer: NodeJS.Timeout | undefined;
    // Writes to one process stay in order: each waits for the previous one. Output can arrive before the
    // start call returns the handle, so lines for a process that has no handle yet are held, then flushed.
    const held = { worker: [] as string[], grader: [] as string[] };
    const queues = new Map<CloudProcess, Promise<unknown>>();
    const write = (proc: CloudProcess, line: string) => {
      queues.set(proc, (queues.get(proc) ?? Promise.resolve()).then(() => proc.sendStdin(`${line}\n`)).catch(() => {}));
    };
    const send = (role: 'worker' | 'grader', line: string) => {
      const proc = role === 'worker' ? workerProc : graderProc;
      if (proc) write(proc, line); else held[role].push(line);
    };
    const killAll = () => { void workerProc?.kill().catch(() => {}); void graderProc?.kill().catch(() => {}); };
    const lifetime = setTimeout(() => { state.timedOut = true; killAll(); }, options.lifetimeMs);
    const onAbort = () => { state.aborted = true; killAll(); };
    signal.addEventListener('abort', onAbort, { once: true });

    // Only time spent inside candidate code counts against wall_time_ms.
    const startBudget = () => {
      clearTimeout(budgetTimer);
      budgetTimer = setTimeout(() => { state.timedOut = true; killAll(); }, Math.max(0, options.wallTimeMs - state.candidateMs));
    };
    const dispatch = () => {
      if (!pending || !workerReady || pending.sentAt > 0) return;
      pending.sentAt = Date.now();
      send('worker', pending.line);
      startBudget();
    };
    const answerGrader = (message: unknown) => send('grader', JSON.stringify(message));
    const stopWorker = () => {
      if (workerClosed) return;
      workerClosed = true;
      void workerProc?.closeStdin().catch(() => {});
      void workerProc?.kill().catch(() => {});
    };
    const workerFails = (fault: 'WorkerDied' | 'ProtocolViolation') => {
      state.workerFault ??= fault;
      stopWorker();
      clearTimeout(budgetTimer);
      if (pending) { answerGrader({ id: pending.id, ok: false, error: { type: fault, message: 'candidate worker unavailable' } }); pending = null; }
    };

    // Grader (trusted) -> host: calls to relay, then exactly one report.
    const onGraderStdout = lineReader(MAX_LINE_BYTES, line => {
      let message: unknown;
      try { message = JSON.parse(line); } catch { state.graderBroken = true; killAll(); return; }
      if (!isObject(message)) { state.graderBroken = true; killAll(); return; }
      if (message.type === 'report') {
        if (state.report !== null) { state.graderBroken = true; killAll(); return; }
        state.report = message;
        return;
      }
      if ((message.op !== 'call' && message.op !== 'resolve') || typeof message.id !== 'number' || pending) {
        state.graderBroken = true; killAll(); return;
      }
      state.calls += 1;
      if (state.calls > MAX_CALLS) { state.graderBroken = true; killAll(); return; }
      if (state.workerFault) {
        answerGrader({ id: message.id, ok: false, error: { type: state.workerFault, message: 'candidate worker unavailable' } });
        return;
      }
      pending = { id: message.id, sentAt: 0, line: JSON.stringify(message) };
      dispatch();
    }, () => { state.graderBroken = true; killAll(); });

    // Worker (untrusted) -> host: one ready line, then replies. Anything else is a violation.
    const onWorkerStdout = lineReader(MAX_LINE_BYTES, line => {
      if (state.workerFault) return;
      let message: unknown;
      try { message = JSON.parse(line); } catch { workerFails('ProtocolViolation'); return; }
      if (!workerReady) {
        if (isObject(message) && message.id === 0 && message.kind === 'ready') { workerReady = true; dispatch(); return; }
        workerFails('ProtocolViolation');
        return;
      }
      if (!pending || pending.sentAt === 0 || !validWorkerReply(message, pending.id)) { workerFails('ProtocolViolation'); return; }
      clearTimeout(budgetTimer);
      state.candidateMs += Date.now() - pending.sentAt;
      pending = null;
      answerGrader(message);
    }, () => workerFails('ProtocolViolation'));

    const finish = () => {
      if (finished || state.graderCode === undefined || state.workerCode === undefined) return;
      finished = true;
      clearTimeout(lifetime); clearTimeout(budgetTimer);
      signal.removeEventListener('abort', onAbort);
      done(state);
    };
    const failStart = () => { state.startFailed = true; state.graderCode ??= null; state.workerCode ??= null; killAll(); finish(); };

    const timeoutMs = options.lifetimeMs;
    Promise.all([
      options.worker.start('python -I -B /harness/worker.py', { cwd: '/work', timeoutMs,
        onStdout: data => onWorkerStdout(Buffer.from(data)), onStderr: options.onWorkerStderr }),
      options.grader.start(['python', '-I', '-B', '/harness/grade.py', '-q', '-p', 'no:cacheprovider', '-c', '/grade/pytest.ini',
        '--rootdir', '/grade', ...options.selected].map(quote).join(' '), { cwd: '/grade', timeoutMs,
        envs: { TORQUE_MODULES: options.modules.join(','), PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1' },
        onStdout: data => onGraderStdout(Buffer.from(data)), onStderr: options.onGraderStderr }),
    ]).then(([w, g]) => {
      workerProc = w; graderProc = g;
      for (const line of held.worker.splice(0)) write(w, line);
      for (const line of held.grader.splice(0)) write(g, line);
      if (workerClosed) { void w.closeStdin().catch(() => {}); void w.kill().catch(() => {}); }
      if (state.aborted || state.timedOut || state.graderBroken) killAll();
      dispatch();
      void w.exited().then(code => {
        state.workerCode = code;
        // Exiting while the grader still needs it (crash, OOM, os._exit) is a worker fault.
        if (!workerClosed) workerFails('WorkerDied');
        finish();
      });
      void g.exited().then(code => {
        state.graderCode = code;
        stopWorker();
        finish();
      });
    }, failStart);
  });
}

/** Default instance for wiring: `ports.runTests = runTestsInE2B` when RUNNER=e2b. */
export const runTestsInE2B = createE2BRunner();
