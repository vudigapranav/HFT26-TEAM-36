// Real runTests seam (R2 + R3 split-container grading).
//
// Trust boundary (R3): every run uses TWO containers from the same image.
// - worker (UNTRUSTED): the candidate's files + read-only harness. No tests, no expected
//   values, no report path, nothing writable but a small tmpfs. Task limits apply here.
// - grader (TRUSTED): tests + pytest. Candidate modules are proxies; each call is one JSON
//   line that this host relays to the worker and the reply back, with strict framing,
//   size caps, one call in flight and id checks. The report leaves the grader on its own
//   protocol stream, so candidate code can neither read hidden tests nor touch the grade.
// Candidates DO see the arguments their functions are called with (including hidden-test
// inputs). Tasks must call candidate functions with plain data (see runner/harness/protocol.py).
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Context, InternalRunResult, Limits, RunRequest, SeamResult, TestFile, TestResult } from '../contracts/internal.js';

export type DockerRunnerOptions = {
  image?: string;
  docker?: string;
  /** Arguments placed before every docker subcommand (e.g. ['--host', ...]); also used by tests to drive a fake CLI. */
  dockerArgs?: string[];
  /** Upper bound for health checks and kill/rm cleanup calls. */
  controlTimeoutMs?: number;
  /** Infrastructure allowance (container start, pytest collection) on top of the candidate's wall_time_ms. */
  startupBudgetMs?: number;
};

const DEFAULT_IMAGE = 'torquecode-runner-python:dev';
const HEALTHY_CACHE_MS = 10_000;
const MAX_LINE_BYTES = 1_048_576;
const MAX_CALLS = 10_000;
const GRADER_LIMITS = { memory_mb: 256, pids: 64 };
const HARNESS_FILES = ['protocol.py', 'worker.py', 'grade.py'];
// Candidate-facing messages never carry docker's own text (socket paths, hosts, host paths).
const SANDBOX_DOWN = 'Sandbox unavailable: the container runtime is not reachable';
const SANDBOX_START_FAILED = 'Sandbox unavailable: the container could not be started';
const RUNNER_BUSY = 'Sandbox unavailable: runner busy, try again shortly';
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
// Files pytest or Python would load as configuration or that would shadow the harness.
const FORBIDDEN_NAMES = new Set(['conftest.py', 'pytest.ini', 'pyproject.toml', 'setup.cfg', 'tox.ini',
  'sitecustomize.py', 'usercustomize.py', 'pytest.py', 'pluggy.py', 'protocol.py', 'worker.py', 'grade.py']);
const FORBIDDEN_SEGMENTS = new Set(['__pycache__', '_pytest', 'pytest', 'pluggy']);
const TRUSTED_INI = '[pytest]\naddopts =\n';

const unavailable = (message: string): SeamResult<InternalRunResult> => ({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE', message });

/** Path is relative, normalized, made of safe segments with one extension. */
function safePath(path: string): boolean {
  if (path.length === 0 || path.length > 200 || path !== posix.normalize(path) || path.startsWith('/')) return false;
  const segments = path.split('/');
  const file = segments.pop()!;
  const dot = file.lastIndexOf('.');
  return dot > 0 && SEGMENT.test(file.slice(0, dot)) && /^[A-Za-z0-9]+$/.test(file.slice(dot + 1)) && segments.every(s => SEGMENT.test(s));
}

function validateLimits(limits: Limits): string | null {
  const within = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  if (!within(limits.wall_time_ms, 100, 120_000)) return 'wall_time_ms out of range';
  if (!within(limits.memory_mb, 32, 2048)) return 'memory_mb out of range';
  if (!within(limits.cpu_count, 1, 4)) return 'cpu_count out of range';
  if (!within(limits.pids, 8, 512)) return 'pids out of range';
  if (!within(limits.output_bytes, 1024, 1_048_576)) return 'output_bytes out of range';
  return null;
}

/** Returns a reason when the request must not run. Candidate files never touch trusted paths. */
export function validateRequest(input: RunRequest): string | null {
  if (input.mode !== 'run' && input.mode !== 'submit') return 'invalid mode';
  const limits = validateLimits(input.limits);
  if (limits) return limits;
  if (input.files.length === 0 || input.files.length > 20) return 'expected 1-20 files';
  if (input.tests.length === 0 || input.tests.length > 30) return 'expected 1-30 test files';
  const seen = new Set<string>();
  const testDirs = new Set<string>();
  let bytes = 0;
  for (const test of input.tests) {
    if (!safePath(test.path) || !test.path.endsWith('.py')) return `invalid test path ${JSON.stringify(test.path)}`;
    if (test.visibility !== 'visible' && test.visibility !== 'hidden') return 'invalid test visibility';
    if (test.ids.length === 0 || test.ids.some(id => !id.startsWith(`${test.path}::`))) return `test ids must belong to ${test.path}`;
    if (seen.has(test.path.toLowerCase())) return `duplicate path ${test.path}`;
    seen.add(test.path.toLowerCase());
    testDirs.add(posix.dirname(test.path));
    bytes += Buffer.byteLength(test.content);
  }
  for (const file of input.files) {
    if (!safePath(file.path)) return `invalid file path ${JSON.stringify(file.path)}`;
    const segments = file.path.split('/');
    const name = segments.at(-1)!.toLowerCase();
    if (FORBIDDEN_NAMES.has(name) || name.endsWith('.pth') || segments.slice(0, -1).some(s => FORBIDDEN_SEGMENTS.has(s.toLowerCase()))) {
      return `file ${file.path} is not allowed`;
    }
    // Hosts may be case-insensitive (Windows, macOS): compare lowercased.
    if (seen.has(file.path.toLowerCase())) return `file ${file.path} collides with another file or a test`;
    if (testDirs.has(posix.dirname(file.path)) && posix.dirname(file.path) !== '.') return `file ${file.path} is inside a test directory`;
    seen.add(file.path.toLowerCase());
    bytes += Buffer.byteLength(file.content);
  }
  if (bytes > 2_097_152) return 'files exceed 2 MiB';
  return null;
}

/** Keeps the first `budget` bytes of a stream and drains the rest so the container never blocks on a full pipe. */
function capped(budget: number) {
  const chunks: Buffer[] = [];
  let kept = 0;
  return {
    push(chunk: Buffer) {
      if (kept >= budget) return;
      const part = chunk.subarray(0, budget - kept);
      chunks.push(part);
      kept += part.length;
    },
    text() {
      // Drop a trailing partial UTF-8 sequence instead of emitting U+FFFD bytes past the budget.
      let text = Buffer.concat(chunks).toString('utf8');
      while (Buffer.byteLength(text) > budget) text = text.slice(0, -1);
      return text;
    },
  };
}

// Containers still running if this process exits unexpectedly. Labelled too, so
// `docker rm -f $(docker ps -aq --filter label=torquecode.runner)` clears leftovers.
const active = new Map<string, { docker: string; prefix: string[] }>();
process.once('exit', () => {
  for (const [name, { docker, prefix }] of active) spawnSync(docker, [...prefix, 'rm', '-f', name], { stdio: 'ignore', timeout: 5000 });
});

/** Runs a docker control command with a hard time bound; resolves with its exit code (null = failed/timed out). */
function dockerControl(docker: string, args: string[], timeoutMs: number): Promise<number | null> {
  return new Promise(done => {
    const child = spawn(docker, args, { stdio: 'ignore', shell: false, timeout: timeoutMs, killSignal: 'SIGKILL' });
    child.once('error', () => done(null));
    child.once('close', (code, signal) => done(signal ? null : code));
  });
}

// Lines the docker CLI (not the candidate) writes; they can name sockets, hosts and host paths.
const DOCKER_NOISE = /^(docker: |Error response from daemon|Cannot connect to the Docker daemon|error during connect|Unable to find image|WARNING: )|docker\.sock|dockerDesktopLinuxEngine|docker_engine|npipe:/i;
const scrubDockerText = (text: string) => text.split('\n').filter(line => !DOCKER_NOISE.test(line)).join('\n');

/** Dotted module names for the candidate's .py files ("app/summary.py" -> "app.summary"). */
export function candidateModules(files: RunRequest['files']): string[] {
  return files.filter(file => file.path.endsWith('.py'))
    .map(file => file.path.slice(0, -3).split('/').filter(part => part !== '__init__').join('.'))
    .filter(name => name.length > 0);
}

/** Harness sources (trusted, mounted read-only into both containers). Works from src and from dist. */
async function harnessDir(): Promise<string> {
  const candidates = [
    process.env.RUNNER_HARNESS_DIR,
    fileURLToPath(new URL('./harness/', import.meta.url)),
    fileURLToPath(new URL('../../runner/harness/', import.meta.url)),
  ].filter((dir): dir is string => Boolean(dir));
  for (const dir of candidates) {
    if (await stat(join(dir, 'grade.py')).then(() => true, () => false)) return dir;
  }
  throw new Error('runner harness not found');
}

async function writeWorkspace(root: string, input: RunRequest, selected: TestFile[]) {
  const candidate = join(root, 'candidate');
  const grader = join(root, 'grader');
  const harness = join(root, 'harness');
  const write = async (base: string, relative: string, content: string) => {
    const target = resolve(base, ...relative.split('/'));
    if (!target.startsWith(base + sep)) throw new Error('path escapes workspace');
    await mkdir(dirname(target), { recursive: true, mode: 0o755 });
    await writeFile(target, content, { mode: 0o644, flag: 'wx' }); // wx: never overwrite
  };
  // Untrusted side: the candidate's files only. No tests, no config, nothing writable.
  for (const file of input.files) await write(candidate, file.path, file.content);
  // Trusted side: tests written fresh every run, our own config, empty conftests.
  for (const test of selected) await write(grader, test.path, test.content);
  await write(grader, 'pytest.ini', TRUSTED_INI);
  await write(grader, 'conftest.py', '');
  for (const directory of new Set(selected.map(test => posix.dirname(test.path)))) {
    if (directory !== '.') await write(grader, `${directory}/conftest.py`, '');
  }
  const source = await harnessDir();
  for (const name of HARNESS_FILES) await write(harness, name, await readFile(join(source, name), 'utf8'));
  await mkdir(candidate, { recursive: true });
  // Containers run as uid 10001: everything readable, nothing writable.
  await chmod(root, 0o755);
  return { candidate, grader, harness };
}

/** Splits a stream into lines; a line over `limit` bytes is reported instead of buffered. */
function lineReader(limit: number, onLine: (line: string) => void, onOverflow: () => void) {
  let buffer = Buffer.alloc(0);
  let overflowed = false;
  return (chunk: Buffer) => {
    if (overflowed) return;
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const newline = buffer.indexOf(0x0a);
      if (newline < 0) break;
      const line = buffer.subarray(0, newline).toString('utf8');
      buffer = buffer.subarray(newline + 1);
      if (newline > limit) { overflowed = true; onOverflow(); return; }
      onLine(line);
    }
    if (buffer.length > limit) { overflowed = true; onOverflow(); }
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A worker reply is forwarded only if it is exactly a reply to the pending request. */
function validWorkerReply(message: unknown, pendingId: number): message is Record<string, unknown> {
  if (!isObject(message) || message.id !== pendingId || typeof message.ok !== 'boolean') return false;
  if (message.ok) return !('error' in message);
  const error = message.error;
  return isObject(error) && typeof error.type === 'string' && error.type.length <= 100
    && (error.message === undefined || typeof error.message === 'string')
    && (error.where === undefined || typeof error.where === 'string');
}

/**
 * Process-wide admission control for whole Run/Submit operations (each starts two containers).
 * FIFO; at most RUNNER_MAX_CONCURRENT running and RUNNER_MAX_QUEUE waiting; a full queue is
 * refused at once (unavailable, never a grade). Shared by every createDockerRunner() instance
 * in this process. Process-local: several backend processes on one machine are not coordinated.
 */
export class RunnerAdmission {
  private running = 0;
  private readonly waiting: { admit: () => void; cancel: () => void }[] = [];
  constructor(readonly maxConcurrent: number, readonly maxQueue: number) {}

  stats() { return { running: this.running, queued: this.waiting.length, maxConcurrent: this.maxConcurrent, maxQueue: this.maxQueue }; }

  /** Resolves with a release function once admitted, or null if the queue is full. Rejects with the abort reason. */
  acquire(signal: AbortSignal): Promise<(() => void) | null> {
    signal.throwIfAborted();
    if (this.running < this.maxConcurrent && this.waiting.length === 0) return Promise.resolve(this.admit());
    if (this.waiting.length >= this.maxQueue) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const entry = {
        admit: () => { signal.removeEventListener('abort', onAbort); resolve(this.admit()); },
        cancel: () => { signal.removeEventListener('abort', onAbort); reject(signal.reason); },
      };
      const onAbort = () => {
        const index = this.waiting.indexOf(entry);
        if (index >= 0) this.waiting.splice(index, 1);
        entry.cancel();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(entry);
    });
  }

  private admit(): () => void {
    this.running += 1;
    let released = false;
    return () => {
      if (released) return; // exactly once, whatever the caller does
      released = true;
      this.running -= 1;
      this.waiting.shift()?.admit();
    };
  }
}

const envInt = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};
/** The single process-wide limiter used by every runner instance. */
export const runnerAdmission = new RunnerAdmission(
  envInt(process.env.RUNNER_MAX_CONCURRENT, 2, 1, 16),
  envInt(process.env.RUNNER_MAX_QUEUE, 8, 0, 64),
);

export function createDockerRunner(options: DockerRunnerOptions = {}) {
  const image = options.image ?? process.env.RUNNER_IMAGE ?? DEFAULT_IMAGE;
  const docker = options.docker ?? 'docker';
  const prefix = options.dockerArgs ?? [];
  const controlTimeoutMs = options.controlTimeoutMs ?? 10_000;
  const startupBudgetMs = options.startupBudgetMs ?? 20_000;
  const control = (args: string[]) => dockerControl(docker, [...prefix, ...args], controlTimeoutMs);

  // Daemon health: a success is cached briefly; a failure is never cached.
  let healthyUntil = 0;
  async function daemonHealthy(useCache: boolean): Promise<boolean> {
    if (useCache && Date.now() < healthyUntil) return true;
    const healthy = (await control(['version', '--format', '{{.Server.Version}}'])) === 0;
    healthyUntil = healthy ? Date.now() + HEALTHY_CACHE_MS : 0;
    return healthy;
  }

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
    // Admission covers the whole operation (worker + grader), shared by every runner in this process.
    const release = await runnerAdmission.acquire(context.signal);
    if (!release) return unavailable(RUNNER_BUSY);
    try { return await admitted(); } finally { release(); }

    async function admitted(): Promise<SeamResult<InternalRunResult>> {
      if (!(await daemonHealthy(true))) return unavailable(SANDBOX_DOWN);
      context.signal.throwIfAborted();

      const root = await mkdtemp(join(tmpdir(), 'torquecode-run-'));
      const runId = randomUUID();
      const names = { worker: `torquecode-w-${runId}`, grader: `torquecode-g-${runId}` };
      const cidfiles = { worker: join(root, 'worker.cid'), grader: join(root, 'grader.cid') };
      let started = false;
      try {
        const dirs = await writeWorkspace(root, input, selected);
        if (Object.values(dirs).some(dir => dir.includes(','))) return unavailable('Workspace path contains a comma');
        const { limits } = input;
        const common = (name: string, cidfile: string) => [
          ...prefix, 'run', '--rm', '-i', '--name', name, '--cidfile', cidfile, '--label', 'torquecode.runner=1', '--pull', 'never',
          '--network', 'none', '--read-only', '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
          '--log-opt', 'max-size=1m', '--log-opt', 'max-file=1',
          '--mount', `type=bind,source=${dirs.harness},target=/harness,readonly`,
        ];
        // Untrusted: candidate code. Task limits apply here.
        const workerArgs = [
          ...common(names.worker, cidfiles.worker),
          '--memory', `${limits.memory_mb}m`, '--memory-swap', `${limits.memory_mb}m`,
          '--cpus', String(limits.cpu_count), '--pids-limit', String(limits.pids),
          '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=64m',
          '--mount', `type=bind,source=${dirs.candidate},target=/work,readonly`, '--workdir', '/work',
          image, 'python', '-I', '-B', '/harness/worker.py',
        ];
        // Trusted: tests and pytest. Never mounts or imports candidate files.
        const graderArgs = [
          ...common(names.grader, cidfiles.grader),
          '--memory', `${GRADER_LIMITS.memory_mb}m`, '--memory-swap', `${GRADER_LIMITS.memory_mb}m`,
          '--cpus', '1', '--pids-limit', String(GRADER_LIMITS.pids),
          '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m',
          '-e', `TORQUE_MODULES=${modules.join(',')}`, '-e', 'PYTEST_DISABLE_PLUGIN_AUTOLOAD=1',
          '--mount', `type=bind,source=${dirs.grader},target=/grade,readonly`, '--workdir', '/grade',
          image, 'python', '-I', '-B', '/harness/grade.py', '-q', '-p', 'no:cacheprovider',
          '-c', '/grade/pytest.ini', '--rootdir', '/grade', ...selected.map(test => test.path),
        ];

        const graderOutput = capped(limits.output_bytes); // pytest's report text
        const candidateOutput = capped(limits.output_bytes); // the candidate's own prints
        const outcome = await new Promise<RelayOutcome>(done => {
          const worker = spawn(docker, workerArgs, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
          const grader = spawn(docker, graderArgs, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
          started = true;
          // A container that died leaves a closed pipe: EPIPE on write must never crash the API process.
          for (const child of [worker, grader]) for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', () => {});
          active.set(names.worker, { docker, prefix });
          active.set(names.grader, { docker, prefix });
          const state: RelayOutcome = { report: null, graderCode: undefined, workerCode: undefined, spawnError: false,
            timedOut: false, aborted: false, graderBroken: false, workerFault: null, candidateMs: 0, calls: 0 };
          let workerReady = false;
          let workerClosed = false;
          let pending: { id: number; sentAt: number; line: string } | null = null;
          let budgetTimer: NodeJS.Timeout | undefined;
          let backstop: NodeJS.Timeout | undefined;
          let finished = false;
          const send = (child: typeof worker, line: string) => { if (!child.stdin.destroyed) child.stdin.write(`${line}\n`); };
          const killAll = () => {
            void control(['kill', names.worker]);
            void control(['kill', names.grader]);
            // If the daemon hangs, `docker kill` can't land: kill the CLIs so this always ends.
            backstop ??= setTimeout(() => { worker.kill('SIGKILL'); grader.kill('SIGKILL'); }, controlTimeoutMs);
          };
          const lifetime = setTimeout(() => { state.timedOut = true; killAll(); }, limits.wall_time_ms + startupBudgetMs);
          const onAbort = () => { state.aborted = true; killAll(); };
          context.signal.addEventListener('abort', onAbort, { once: true });

          // Only time spent inside candidate code counts against wall_time_ms.
          const startBudget = () => {
            clearTimeout(budgetTimer);
            budgetTimer = setTimeout(() => { state.timedOut = true; killAll(); }, Math.max(0, limits.wall_time_ms - state.candidateMs));
          };
          const dispatch = () => {
            if (!pending || !workerReady || pending.sentAt > 0) return;
            pending.sentAt = Date.now();
            send(worker, pending.line);
            startBudget();
          };
          const answerGrader = (message: unknown) => send(grader, JSON.stringify(message));
          // Stop the worker for good: kill the container, close its input, and if its docker
          // CLI still hasn't exited after the grace period, kill the CLI process too.
          let workerReaper: NodeJS.Timeout | undefined;
          const stopWorker = () => {
            if (workerClosed) return;
            workerClosed = true;
            worker.stdin.end();
            void control(['kill', names.worker]);
            workerReaper = setTimeout(() => worker.kill('SIGKILL'), controlTimeoutMs);
          };
          const workerFails = (fault: 'WorkerDied' | 'ProtocolViolation') => {
            state.workerFault ??= fault;
            stopWorker();
            clearTimeout(budgetTimer);
            if (pending) { answerGrader({ id: pending.id, ok: false, error: { type: fault, message: 'candidate worker unavailable' } }); pending = null; }
          };

          // Grader (trusted) -> host: calls to relay, then exactly one report.
          grader.stdout.on('data', lineReader(MAX_LINE_BYTES, line => {
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
          }, () => { state.graderBroken = true; killAll(); }));
          grader.stderr.on('data', (chunk: Buffer) => graderOutput.push(chunk));

          // Worker (untrusted) -> host: one ready line, then replies. Anything else is a violation.
          worker.stdout.on('data', lineReader(MAX_LINE_BYTES, line => {
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
          }, () => workerFails('ProtocolViolation')));
          worker.stderr.on('data', (chunk: Buffer) => candidateOutput.push(chunk));

          const finish = () => {
            if (finished || state.graderCode === undefined || state.workerCode === undefined) return;
            finished = true;
            clearTimeout(lifetime); clearTimeout(budgetTimer); clearTimeout(backstop); clearTimeout(workerReaper);
            context.signal.removeEventListener('abort', onAbort);
            done(state);
          };
          worker.once('error', () => { state.spawnError = true; killAll(); });
          grader.once('error', () => { state.spawnError = true; killAll(); });
          worker.once('close', code => {
            state.workerCode = code;
            // Exiting while the grader still needs it (os._exit, OOM, crash) is a worker fault.
            if (!workerClosed) workerFails('WorkerDied');
            finish();
          });
          grader.once('close', code => {
            state.graderCode = code;
            // Grader done: release the worker.
            stopWorker();
            finish();
          });
        });

        if (outcome.aborted) throw context.signal.reason ?? new Error('Aborted');
        if (outcome.spawnError) return unavailable(SANDBOX_DOWN);
        const startFailed = (code: number | null | undefined) => code === 125 || code === 126 || code === 127;
        if (!outcome.timedOut && (startFailed(outcome.graderCode) || startFailed(outcome.workerCode))) return unavailable(SANDBOX_START_FAILED);
        // No container id: docker never created that container, whatever the exit code.
        const created = async (file: string) => readFile(file, 'utf8').then(id => id.trim().length > 0, () => false);
        if (!(await created(cidfiles.grader)) || !(await created(cidfiles.worker))) {
          return unavailable((await daemonHealthy(false)) ? SANDBOX_START_FAILED : SANDBOX_DOWN);
        }

        const report = parseReport(outcome.report, expectedIds);
        // Anything not cleanly gradable might be infrastructure (daemon died mid-run, grader
        // killed). Only grade it if the daemon is demonstrably healthy; otherwise no grade.
        const clean = !outcome.timedOut && !outcome.graderBroken && report !== null && (outcome.graderCode === 0 || outcome.graderCode === 1);
        if (!clean && !(await daemonHealthy(false))) return unavailable(SANDBOX_DOWN);
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
          run_id: runId, task_id: input.task_id, mode: input.mode, tests,
          passed: tests.filter(test => test.status === 'pass').length, total: tests.length,
          stdout: scrubDockerText(graderOutput.text()), stderr: scrubDockerText(candidateOutput.text()), timed_out: outcome.timedOut,
        } };
      } finally {
        // --rm removes exited containers; this covers kill, abort and crashes.
        if (started) await Promise.all([control(['rm', '-f', names.worker]), control(['rm', '-f', names.grader])]);
        active.delete(names.worker);
        active.delete(names.grader);
        await rm(root, { recursive: true, force: true });
      }
    }
  };
}

type RelayOutcome = {
  report: Record<string, unknown> | null;
  graderCode: number | null | undefined;
  workerCode: number | null | undefined;
  spawnError: boolean;
  timedOut: boolean;
  aborted: boolean;
  graderBroken: boolean;
  workerFault: 'WorkerDied' | 'ProtocolViolation' | null;
  candidateMs: number;
  calls: number;
};

/** The grader's report: per-test status for expected ids only; anything malformed is null. */
function parseReport(report: Record<string, unknown> | null, expectedIds: string[]) {
  if (!report || !Array.isArray(report.tests)) return null;
  const expected = new Set(expectedIds);
  const tests = new Map<string, { status: TestResult['status']; duration_ms: number }>();
  let unsupported = false;
  for (const entry of report.tests) {
    if (!isObject(entry) || typeof entry.id !== 'string' || typeof entry.status !== 'string') return null;
    const duration = typeof entry.duration_ms === 'number' && Number.isFinite(entry.duration_ms) && entry.duration_ms >= 0 ? entry.duration_ms : 0;
    if (entry.status === 'unsupported') { unsupported = true; continue; }
    if (!expected.has(entry.id)) continue;
    const status = entry.status === 'pass' || entry.status === 'fail' ? entry.status : 'error';
    if (tests.has(entry.id)) return null; // duplicates are never trusted
    tests.set(entry.id, { status, duration_ms: Math.round(duration) });
  }
  return { tests, unsupported };
}

/** Default instance for wiring: `ports.runTests = runTestsInDocker` when RUNNER=docker. */
export const runTestsInDocker = createDockerRunner();
