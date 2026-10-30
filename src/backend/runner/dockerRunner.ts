// Real runTests seam (R2): runs candidate Python + trusted pytest tests in an
// isolated Docker container. Flags proved in R0 (docs/status/rithvik.md).
//
// Limitation (R3): candidate code runs in the same interpreter as the tests, so
// it can introspect them at runtime. The grade is fail-closed (exit code and
// JUnit report must agree), but this is not a confidentiality boundary.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve, sep } from 'node:path';
import type { Context, InternalRunResult, Limits, RunRequest, SeamResult, TestFile } from '../contracts/internal.js';
import { grade } from './junit.js';

export type DockerRunnerOptions = { image?: string; docker?: string };

const DEFAULT_IMAGE = 'torquecode-runner-python:dev';
const REPORT_MAX_BYTES = 1_048_576;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
// Files pytest or Python would load as configuration or that would shadow the harness.
const FORBIDDEN_NAMES = new Set(['conftest.py', 'pytest.ini', 'pyproject.toml', 'setup.cfg', 'tox.ini',
  'sitecustomize.py', 'usercustomize.py', 'pytest.py', 'pluggy.py']);
const FORBIDDEN_SEGMENTS = new Set(['__pycache__', '_pytest', 'pytest', 'pluggy']);
const TRUSTED_INI = '[pytest]\npythonpath = .\njunit_logging = no\njunit_family = xunit1\naddopts =\n';

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
const active = new Map<string, string>();
process.once('exit', () => {
  for (const [name, docker] of active) spawnSync(docker, ['rm', '-f', name], { stdio: 'ignore', timeout: 5000 });
});

function dockerQuiet(docker: string, args: string[]): Promise<void> {
  return new Promise(done => {
    const child = spawn(docker, args, { stdio: 'ignore', shell: false });
    child.once('error', () => done());
    child.once('close', () => done());
  });
}

async function writeWorkspace(root: string, input: RunRequest, selected: TestFile[]) {
  const work = join(root, 'work');
  const out = join(root, 'out');
  const write = async (relative: string, content: string) => {
    const target = resolve(work, ...relative.split('/'));
    if (!target.startsWith(work + sep)) throw new Error('path escapes workspace');
    await mkdir(dirname(target), { recursive: true, mode: 0o755 });
    await writeFile(target, content, { mode: 0o644, flag: 'wx' }); // wx: never overwrite
  };
  await mkdir(out, { recursive: true });
  for (const file of input.files) await write(file.path, file.content);
  // Trusted files are written fresh on every run; candidates cannot supply them.
  for (const test of selected) await write(test.path, test.content);
  await write('pytest.ini', TRUSTED_INI);
  await write('conftest.py', '');
  for (const directory of new Set(selected.map(test => posix.dirname(test.path)))) {
    if (directory !== '.') await write(`${directory}/conftest.py`, '');
  }
  // The container runs as uid 10001: workspace readable, /out writable (R0 technique).
  await chmod(root, 0o755);
  await chmod(out, 0o777);
  return { work, out };
}

export function createDockerRunner(options: DockerRunnerOptions = {}) {
  const image = options.image ?? process.env.RUNNER_IMAGE ?? DEFAULT_IMAGE;
  const docker = options.docker ?? 'docker';

  return async function runTests(input: RunRequest, context: Context): Promise<SeamResult<InternalRunResult>> {
    context.signal.throwIfAborted();
    const rejected = validateRequest(input);
    if (rejected) return unavailable(`Rejected run request: ${rejected}`);

    const selected = input.tests.filter(test => input.mode === 'submit' || test.visibility === 'visible');
    if (selected.length === 0) return unavailable('Rejected run request: no tests selected');
    const expectedIds = selected.flatMap(test => test.ids);
    if (new Set(expectedIds).size !== expectedIds.length) return unavailable('Rejected run request: duplicate test ids');
    const visibility = new Map(selected.flatMap(test => test.ids.map(id => [id, test.visibility] as const)));

    const root = await mkdtemp(join(tmpdir(), 'torquecode-run-'));
    const name = `torquecode-run-${randomUUID()}`;
    let started = false;
    try {
      const { work, out } = await writeWorkspace(root, input, selected);
      if (work.includes(',') || out.includes(',')) return unavailable('Workspace path contains a comma');
      const { limits } = input;
      const args = [
        'run', '--rm', '--name', name, '--label', 'torquecode.runner=1', '--pull', 'never',
        '--network', 'none', '--memory', `${limits.memory_mb}m`, '--memory-swap', `${limits.memory_mb}m`,
        '--cpus', String(limits.cpu_count), '--pids-limit', String(limits.pids),
        '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=64m',
        '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--log-opt', 'max-size=1m', '--log-opt', 'max-file=1',
        '-e', 'PYTEST_DISABLE_PLUGIN_AUTOLOAD=1',
        '--mount', `type=bind,source=${work},target=/work,readonly`,
        '--mount', `type=bind,source=${out},target=/out`,
        '--workdir', '/work',
        image,
        // -I: ignore PYTHON* env and keep cwd off sys.path, so candidate files can't
        // shadow pytest; the trusted ini then adds /work for the task's imports.
        'python', '-I', '-B', '-m', 'pytest', '-q', '-p', 'no:cacheprovider',
        '-c', '/work/pytest.ini', '--rootdir', '/work', '--junitxml', '/out/results.xml',
        ...selected.map(test => test.path),
      ];

      const stdout = capped(limits.output_bytes);
      const stderr = capped(limits.output_bytes);
      let timedOut = false;
      let aborted = false;
      const outcome = await new Promise<{ code: number | null; spawnError?: Error }>(done => {
        const child = spawn(docker, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
        started = true;
        active.set(name, docker);
        const kill = () => { void dockerQuiet(docker, ['kill', name]); };
        const timer = setTimeout(() => { timedOut = true; kill(); }, limits.wall_time_ms);
        const abort = () => { aborted = true; kill(); };
        context.signal.addEventListener('abort', abort, { once: true });
        child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
        const finish = (result: { code: number | null; spawnError?: Error }) => {
          clearTimeout(timer);
          context.signal.removeEventListener('abort', abort);
          done(result);
        };
        child.once('error', error => finish({ code: null, spawnError: error }));
        child.once('close', code => finish({ code }));
      });

      if (aborted) throw context.signal.reason ?? new Error('Aborted');
      if (outcome.spawnError) return unavailable(`Docker could not be started: ${outcome.spawnError.message}`);
      // 125: docker itself failed (daemon down, image missing). 126/127: image can't run python.
      if (!timedOut && (outcome.code === 125 || outcome.code === 126 || outcome.code === 127)) {
        return unavailable(`Sandbox failed to start (docker exit ${outcome.code}): ${stderr.text().slice(0, 300)}`);
      }

      let xml: string | null = null;
      try {
        const report = join(out, 'results.xml');
        if ((await stat(report)).size <= REPORT_MAX_BYTES) xml = await readFile(report, 'utf8');
      } catch { xml = null; }

      const graded = grade(expectedIds, xml, outcome.code, timedOut);
      const tests = expectedIds.map(id => ({ id, ...graded.get(id)!, visibility: visibility.get(id)! }));
      return { kind: 'ok', value: {
        run_id: randomUUID(), task_id: input.task_id, mode: input.mode, tests,
        passed: tests.filter(test => test.status === 'pass').length, total: tests.length,
        stdout: stdout.text(), stderr: stderr.text(), timed_out: timedOut,
      } };
    } finally {
      // --rm removes a container that exited; this covers kill, abort and crashes.
      if (started) await dockerQuiet(docker, ['rm', '-f', name]);
      active.delete(name);
      await rm(root, { recursive: true, force: true });
    }
  };
}

/** Default instance for wiring: `ports.runTests = runTestsInDocker` when RUNNER=docker. */
export const runTestsInDocker = createDockerRunner();
