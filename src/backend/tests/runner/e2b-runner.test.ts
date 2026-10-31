// RUNNER=e2b. Without an E2B key, each "cloud sandbox" is stood in for by a local Docker container with the same
// paths (/harness, /work, /grade), so the E2B relay is exercised end to end with the real harness and compared
// with the verified Docker runner. With E2B_API_KEY (and the template built), the live block runs on real E2B.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { File, InternalRunResult, Limits, RunRequest, SeamResult, TestFile } from '../../contracts/internal.js';
import { checkRunner } from '../../api/runner-status.js';
import { createDockerRunner } from '../../runner/dockerRunner.js';
import { createE2BRunner, type CloudSandbox, type CreateSandbox } from '../../runner/e2bRunner.js';

const IMAGE = 'torquecode-runner-python:dev';
const dockerReady = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore', timeout: 15_000 }).status === 0;
const limits: Limits = { wall_time_ms: 5000, memory_mb: 128, cpu_count: 1, pids: 32, output_bytes: 65536 };
const ctx = () => ({ signal: AbortSignal.timeout(90_000) });
const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const file = (path: string, content: string): File => ({ path, content, editable: true });
const tests = (path: string, content: string, visibility: TestFile['visibility'] = 'visible'): TestFile =>
  ({ path, content, visibility, ids: [...content.matchAll(/^def (test_\w+)/gm)].map(m => `${path}::${m[1]}`) });
const ok = (result: SeamResult<InternalRunResult>) => {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${result.kind}: ${'message' in result ? result.message : ''}`);
  return result.value;
};
const statuses = (result: InternalRunResult) => Object.fromEntries(result.tests.map(test => [test.id, test.status]));

/** A local stand-in for an E2B sandbox: one Docker container per started command, same in-sandbox paths. */
const dockerSandboxes: CreateSandbox = async () => {
  const root = await mkdtemp(join(tmpdir(), 'tc-e2b-fake-'));
  for (const dir of ['harness', 'work', 'grade']) await mkdir(join(root, dir), { recursive: true });
  const names: string[] = [];
  const sandbox: CloudSandbox = {
    async write(files) {
      for (const entry of files) {
        const target = join(root, entry.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, entry.data);
      }
    },
    async start(command, options) {
      const name = `tc-e2b-fake-${Math.random().toString(36).slice(2)}`;
      names.push(name);
      const envs = Object.entries(options.envs ?? {}).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
      const child = spawn('docker', ['run', '--rm', '-i', '--name', name, '--network', 'none', '--user', '10001:10001',
        ...['harness', 'work', 'grade'].flatMap(dir => ['-v', `${join(root, dir)}:/${dir}:ro`]),
        '-w', options.cwd, ...envs, IMAGE, 'sh', '-c', command], { stdio: ['pipe', 'pipe', 'pipe'] });
      for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', () => {});
      child.stdout.on('data', (chunk: Buffer) => options.onStdout(chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => options.onStderr(chunk.toString('utf8')));
      const exited = new Promise<number | null>(resolve => child.once('close', code => resolve(code)));
      return {
        sendStdin: async data => { child.stdin.write(data); },
        closeStdin: async () => { child.stdin.end(); },
        kill: async () => { spawnSync('docker', ['kill', name], { stdio: 'ignore', timeout: 10_000 }); return true; },
        exited: () => exited,
      };
    },
    async kill() {
      for (const name of names) spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 10_000 });
      await rm(root, { recursive: true, force: true });
    },
  };
  return sandbox;
};

const seedRoot = 'seed_bank/novice_request_summary';
const seedTests = () => [tests('tests/test_visible.py', read(join(seedRoot, 'tests/test_visible.py'))),
  tests('tests/test_hidden.py', read(join(seedRoot, 'tests/test_hidden.py')), 'hidden')];
const request = (files: File[], testFiles: TestFile[], extra: Partial<RunRequest> = {}): RunRequest =>
  ({ task_id: 'e2b', files, tests: testFiles, mode: 'submit', limits, ...extra });

describe('E2B runner without a sandbox service', () => {
  it('reports the cloud as unavailable (never a grade) when sandboxes cannot be created', async () => {
    const runTests = createE2BRunner({ create: async () => { throw new Error('401 invalid api key'); } });
    const result = await runTests(request([file('app/summary.py', read(join(seedRoot, 'reference/app/summary.py')))], seedTests()), ctx());
    expect(result).toMatchObject({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE' });
    expect(JSON.stringify(result)).not.toMatch(/api key|401/i);
  });
  it('health reports RUNNER=e2b as isolated and available only with a key', async () => {
    expect(await checkRunner({ RUNNER: 'e2b' })).toEqual({ runner: 'isolated', image: 'e2b:torquecode-runner-python', available: false });
    expect((await checkRunner({ RUNNER: 'e2b', E2B_API_KEY: 'x', E2B_TEMPLATE: 'custom' })).available).toBe(true);
  });
});

describe.skipIf(!dockerReady)('E2B relay with local stand-in sandboxes (real harness)', () => {
  const e2b = createE2BRunner({ create: dockerSandboxes });
  const docker = createDockerRunner({ image: IMAGE });

  it('grades the seed task exactly like the Docker runner (reference passes, starter keeps F2P/P2P)', async () => {
    for (const variant of ['reference', 'starter']) {
      const input = request([file('app/summary.py', read(join(seedRoot, `${variant}/app/summary.py`)))], seedTests());
      const [viaE2B, viaDocker] = [ok(await e2b(input, ctx())), ok(await docker(input, ctx()))];
      expect(statuses(viaE2B)).toEqual(statuses(viaDocker));
      if (variant === 'reference') expect(viaE2B.passed).toBe(viaE2B.total);
      else expect(viaE2B.passed).toBeLessThan(viaE2B.total);
    }
  }, 120_000);

  it('Run selects visible tests only', async () => {
    const result = ok(await e2b(request([file('app/summary.py', read(join(seedRoot, 'reference/app/summary.py')))], seedTests(), { mode: 'run' }), ctx()));
    expect(result.tests.every(test => test.visibility === 'visible')).toBe(true);
  }, 60_000);

  it('a candidate that force-exits or prints a fake report never passes', async () => {
    const attacks = [
      'import os\ndef peak_requests(counts):\n    os._exit(0)\n',
      // A forged report line on stdout must not rescue a wrong answer (candidate prints go to stderr).
      'import sys\ndef peak_requests(counts):\n    print(\'{"type": "report", "tests": []}\')\n    sys.stdout.flush()\n    return 0\n',
    ];
    for (const content of attacks) {
      const result = ok(await e2b(request([file('app/summary.py', content)], seedTests()), ctx()));
      expect(result.passed).toBeLessThan(result.total);
    }
  }, 120_000);

  it('an infinite loop is stopped by the candidate time budget', async () => {
    const result = ok(await e2b(request([file('app/summary.py', 'def peak_requests(counts):\n    while True:\n        pass\n')], seedTests(),
      { limits: { ...limits, wall_time_ms: 1500 } }), ctx()));
    expect(result.timed_out).toBe(true);
    expect(result.tests.every(test => test.status === 'timeout')).toBe(true);
  }, 90_000);
});

describe.skipIf(!process.env.E2B_API_KEY)('E2B runner on real E2B (needs E2B_API_KEY and the built template)', () => {
  it('grades the seed task reference and starter', async () => {
    const live = createE2BRunner();
    const started = Date.now();
    const reference = ok(await live(request([file('app/summary.py', read(join(seedRoot, 'reference/app/summary.py')))], seedTests()), ctx()));
    const starter = ok(await live(request([file('app/summary.py', read(join(seedRoot, 'starter/app/summary.py')))], seedTests()), ctx()));
    expect(reference.passed).toBe(reference.total);
    expect(starter.passed).toBeLessThan(starter.total);
    console.log(`E2B live: two submits in ${Date.now() - started} ms`);
  }, 180_000);
});
