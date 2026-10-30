// Docker infrastructure failures must never become a candidate grade (review finding 7).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { File, InternalRunResult, Limits, RunRequest, SeamResult, TestFile } from '../../contracts/internal.js';
import { createDockerRunner } from '../../runner/dockerRunner.js';

const fixtures = 'tests/fixtures/runner';
const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const testFile = (path: string, visibility: TestFile['visibility']): TestFile => {
  const content = read(join(fixtures, 'base', path));
  return { path, content, visibility, ids: [...content.matchAll(/^def (test_\w+)/gm)].map(m => `${path}::${m[1]}`) };
};
const tests = [testFile('tests/test_visible.py', 'visible'), testFile('tests/test_hidden.py', 'hidden')];
const limits: Limits = { wall_time_ms: 5000, memory_mb: 128, cpu_count: 1, pids: 32, output_bytes: 65536 };
const okCode: File[] = [{ path: 'app/words.py', content: read(`${fixtures}/cases/ok/candidate/app/words.py`), editable: true }];
const request = (files: File[] = okCode, extra: Partial<RunRequest> = {}): RunRequest =>
  ({ task_id: 'infra', files, tests, mode: 'run', limits, ...extra });
const ctx = () => ({ signal: AbortSignal.timeout(60_000) });
const LEAKS = /docker\.sock|npipe|dockerDesktopLinuxEngine|pipe%2F|var\/run|127\.0\.0\.1|tcp:\/\/|[A-Z]:\\|\/tmp\/|torquecode-run-/i;
const expectNoLeak = (result: SeamResult<InternalRunResult>) => {
  const text = JSON.stringify(result);
  expect(text).not.toMatch(LEAKS);
};
const expectDown = (result: SeamResult<InternalRunResult>) => {
  expect(result).toMatchObject({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE' });
  expectNoLeak(result);
};

// Fake docker CLI driven by a mode file (re-read per call).
const scratch = mkdtempSync(join(tmpdir(), 'torquecode-fake-docker-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const fake = (mode: string, extra: { controlTimeoutMs?: number } = {}) => {
  const modeFile = join(scratch, `mode-${Math.random().toString(36).slice(2)}`);
  writeFileSync(modeFile, mode);
  const runner = createDockerRunner({
    image: 'fake', docker: process.execPath, dockerArgs: [resolve(fixtures, 'fake-docker.mjs'), modeFile], ...extra,
  });
  return { runner, setMode: (next: string) => writeFileSync(modeFile, next) };
};

describe('infrastructure failures (fake docker CLI, deterministic)', () => {
  it('daemon down before Run: unavailable, nothing graded, no docker text', async () => {
    expectDown(await fake('down').runner(request(), ctx()));
  });

  it('daemon becomes unavailable after an earlier successful run (health cache does not mask it)', async () => {
    const { runner, setMode } = fake('pass');
    const first = await runner(request(), ctx());
    expect(first).toMatchObject({ kind: 'ok', value: { passed: 2, total: 2 } });
    setMode('down'); // within the 10 s healthy cache window
    expectDown(await runner(request(), ctx()));
  });

  it('docker CLI exits 1 after creating the container, with no report, while the daemon is gone: unavailable', async () => {
    expectDown(await fake('dies-mid-run').runner(request(), ctx()));
  });

  it('health check that hangs is bounded and fails closed', async () => {
    const started = Date.now();
    expectDown(await fake('version-hangs', { controlTimeoutMs: 500 }).runner(request(), ctx()));
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('run hangs and the daemon dies: the CLI is force-killed and the result is unavailable, not timeout', async () => {
    const started = Date.now();
    const result = await fake('run-hangs-daemon-dies', { controlTimeoutMs: 500 }).runner(request(undefined, { limits: { ...limits, wall_time_ms: 300 } }), ctx());
    expectDown(result);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('candidate exits 1 with no report while the daemon is healthy: graded as error (candidate fault)', async () => {
    const result = await fake('candidate-exit-1').runner(request(), ctx());
    expect(result).toMatchObject({ kind: 'ok', value: { passed: 0, total: 2 } });
    if (result.kind === 'ok') expect(result.value.tests.every(test => test.status === 'error')).toBe(true);
  });

  it('normal failing pytest run is graded, and docker CLI noise is removed from stderr', async () => {
    const result = await fake('fail-with-noise').runner(request(), ctx());
    expect(result).toMatchObject({ kind: 'ok', value: { passed: 1, total: 2 } });
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.value.stderr).toContain('candidate stderr line');
    expectNoLeak(result);
  });

  it('missing docker binary: unavailable with a generic message', async () => {
    const result = await createDockerRunner({ docker: 'definitely-not-docker-binary' })(request(), ctx());
    expectDown(result);
    if (result.kind === 'unavailable') expect(result.message).not.toMatch(/ENOENT|spawn/);
  });
});

const IMAGE = 'torquecode-runner-python:dev';
const dockerReady = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore', timeout: 15_000 }).status === 0;

describe.skipIf(!dockerReady)('infrastructure failures (real docker CLI)', () => {
  const real = createDockerRunner({ image: IMAGE });
  const exitWith = (code: number): File[] => [{ path: 'app/words.py', content: `import os\nos._exit(${code})\n`, editable: true }];

  it('real CLI pointed at an unreachable daemon: unavailable, never graded, no host address leaked', async () => {
    const unreachable = createDockerRunner({ image: IMAGE, dockerArgs: ['--host', 'tcp://127.0.0.1:9'], controlTimeoutMs: 5000 });
    expectDown(await unreachable(request(), ctx()));
  }, 60_000);

  it('missing image: unavailable', async () => {
    expectDown(await createDockerRunner({ image: 'torquecode-runner-python:does-not-exist' })(request(), ctx()));
  }, 60_000);

  it.each([0, 1])('candidate os._exit(%i) on a healthy daemon is graded as error, not unavailable and not pass', async code => {
    const result = await real(request(exitWith(code)), ctx());
    expect(result).toMatchObject({ kind: 'ok', value: { passed: 0, total: 2 } });
    if (result.kind === 'ok') expect(result.value.tests.every(test => test.status === 'error')).toBe(true);
  }, 60_000);

  it('reference passes and a normal failure is graded on the real daemon', async () => {
    expect(await real(request(), ctx())).toMatchObject({ kind: 'ok', value: { passed: 2, total: 2 } });
    const buggy: File[] = [{ path: 'app/words.py', content: read(`${fixtures}/cases/buggy/candidate/app/words.py`), editable: true }];
    expect(await real(request(buggy), ctx())).toMatchObject({ kind: 'ok', value: { passed: 1, total: 2 } });
  }, 60_000);
});
