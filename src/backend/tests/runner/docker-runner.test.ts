import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { File, InternalRunResult, Limits, RunRequest, SeamResult, TestFile } from '../../contracts/internal.js';
import { publicRun } from '../../api/public-projections.js';
import { createDockerRunner, validateRequest } from '../../runner/dockerRunner.js';
import { grade, junitKey, parseJUnit } from '../../runner/junit.js';

const IMAGE = 'torquecode-runner-python:dev';
// Windows checkouts may use CRLF; contents are compared as LF.
const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const testFile = (root: string, path: string, visibility: TestFile['visibility']): TestFile => {
  const content = read(join(root, path));
  return { path, content, visibility, ids: [...content.matchAll(/^def (test_\w+)/gm)].map(m => `${path}::${m[1]}`) };
};
const limits: Limits = { wall_time_ms: 5000, memory_mb: 128, cpu_count: 1, pids: 32, output_bytes: 65536 };
const context = () => ({ signal: AbortSignal.timeout(60_000) });
const ok = (result: SeamResult<InternalRunResult>) => {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${result.kind}: ${'message' in result ? result.message : ''}`);
  return result.value;
};
const statuses = (result: InternalRunResult) => Object.fromEntries(result.tests.map(test => [test.id, test.status]));

// Seed task 1, read directly (the K1 digest check is line-ending sensitive).
const seedRoot = 'seed_bank/novice_request_summary';
const seed = {
  task: JSON.parse(read(join(seedRoot, 'task.json'))) as { task_id: string; limits: Limits; f2p_ids: string[]; p2p_ids: string[] },
  starter: [{ path: 'app/summary.py', content: read(join(seedRoot, 'starter/app/summary.py')), editable: true }] as File[],
  reference: [{ path: 'app/summary.py', content: read(join(seedRoot, 'reference/app/summary.py')), editable: true }] as File[],
  tests: [testFile(seedRoot, 'tests/test_visible.py', 'visible'), testFile(seedRoot, 'tests/test_hidden.py', 'hidden')],
};
const seedRequest = (files: File[], mode: RunRequest['mode']): RunRequest =>
  ({ task_id: seed.task.task_id, files, tests: seed.tests, mode, limits: seed.task.limits });

// R0 hostile fixtures: candidate app/words.py against trusted count_unique tests.
const fixtures = 'tests/fixtures/runner';
const baseTests = [testFile(`${fixtures}/base`, 'tests/test_visible.py', 'visible'), testFile(`${fixtures}/base`, 'tests/test_hidden.py', 'hidden')];
const candidate = (name: string): File[] => {
  const dir = `${fixtures}/cases/${name}/candidate/app`;
  return readdirSync(dir).map(file => ({ path: `app/${file}`, content: read(join(dir, file)), editable: true }));
};
const fixtureRequest = (name: string, extra: Partial<RunRequest> = {}): RunRequest =>
  ({ task_id: `fixture-${name}`, files: candidate(name), tests: baseTests, mode: 'submit', limits, ...extra });

const dockerReady = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore', timeout: 15_000 }).status === 0;
const runTests = createDockerRunner({ image: IMAGE });
const leftoverContainers = () => spawnSync('docker', ['ps', '-aq', '--filter', 'label=torquecode.runner=1'], { encoding: 'utf8' }).stdout.trim();

describe('request validation (no Docker)', () => {
  const valid = seedRequest(seed.starter, 'run');
  it.each([
    ['path traversal', '../escape.py'],
    ['absolute path', '/etc/passwd.py'],
    ['backslash path', 'app\\summary.py'],
    ['candidate conftest', 'conftest.py'],
    ['nested conftest', 'app/conftest.py'],
    ['pytest config', 'pytest.ini'],
    ['pyproject', 'pyproject.toml'],
    ['startup hook', 'sitecustomize.py'],
    ['path file', 'app/evil.pth'],
    ['pytest shadow', 'pytest.py'],
    ['replaces a test', 'tests/test_visible.py'],
    ['inside test dir', 'tests/helper.py'],
    ['case-collision with a test', 'Tests/Test_Visible.py'],
    ['leading dash', '-p.py'],
  ])('rejects %s', (_name, path) => {
    expect(validateRequest({ ...valid, files: [...valid.files, { path, content: '', editable: true }] })).not.toBeNull();
  });
  it('rejects duplicate files and bad limits, accepts the seed request', () => {
    expect(validateRequest({ ...valid, files: [...valid.files, ...valid.files] })).toMatch(/collides/);
    expect(validateRequest({ ...valid, limits: { ...limits, wall_time_ms: 999_999 } })).toMatch(/wall_time_ms/);
    expect(validateRequest({ ...valid, tests: [{ ...seed.tests[0]!, ids: ['other.py::x'] }] })).toMatch(/belong/);
    expect(validateRequest(valid)).toBeNull();
  });
  it('rejects without starting Docker', async () => {
    const neverDocker = createDockerRunner({ docker: 'definitely-not-docker' });
    const result = await neverDocker({ ...valid, files: [{ path: '../x.py', content: '', editable: true }] }, context());
    expect(result).toMatchObject({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE', message: expect.stringMatching(/^Rejected/) });
  });
});

describe('JUnit grading (no Docker)', () => {
  const ids = ['tests/test_a.py::test_one', 'tests/test_a.py::test_two'];
  const xml = (cases: string) => `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite name="pytest">${cases}</testsuite></testsuites>`;
  const pass = (name: string) => `<testcase classname="tests.test_a" name="${name}" time="0.010"/>`;
  it('maps node ids to JUnit keys', () => {
    expect(junitKey('tests/test_a.py::TestX::test_y[1-2]')).toBe('tests.test_a.TestX::test_y[1-2]');
  });
  it('passes only when report and exit code agree', () => {
    expect([...grade(ids, xml(pass('test_one') + pass('test_two')), 0, false).values()].map(r => r.status)).toEqual(['pass', 'pass']);
    // Forged all-pass report but pytest exited 1.
    expect([...grade(ids, xml(pass('test_one') + pass('test_two')), 1, false).values()].map(r => r.status)).toEqual(['error', 'error']);
  });
  it('treats missing, malformed, truncated and skipped as error; timeout as timeout', () => {
    const all = (map: Map<string, { status: string }>) => [...map.values()].map(r => r.status);
    expect(all(grade(ids, null, 0, false))).toEqual(['error', 'error']);
    expect(all(grade(ids, '<html>nope</html>', 0, false))).toEqual(['error', 'error']);
    expect(all(grade(ids, xml(pass('test_one') + pass('test_two')).slice(0, -20), 0, false))).toEqual(['error', 'error']);
    expect(all(grade(ids, xml(pass('test_one')), 1, false))).toEqual(['pass', 'error']);
    expect(all(grade(ids, xml(pass('test_one') + '<testcase classname="tests.test_a" name="test_two" time="0"><skipped/></testcase>'), 1, false))).toEqual(['pass', 'error']);
    expect(all(grade(ids, xml(pass('test_one') + pass('test_two')), 3, false))).toEqual(['error', 'error']);
    expect(all(grade(ids, null, null, true))).toEqual(['timeout', 'timeout']);
    expect(parseJUnit(xml('<testcase classname="a" name="b" time="-1"/>'))).toBeNull();
  });
});

describe.skipIf(!dockerReady)('Docker runner (real containers)', () => {
  it('seed task 1: reference passes all 5 tests on submit, repeatedly', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = ok(await runTests(seedRequest(seed.reference, 'submit'), context()));
      expect(result).toMatchObject({ passed: 5, total: 5, timed_out: false, mode: 'submit', task_id: seed.task.task_id });
    }
  }, 60_000);

  it('seed task 1: starter fails exactly the F2P tests and passes the P2P tests', async () => {
    const result = statuses(ok(await runTests(seedRequest(seed.starter, 'submit'), context())));
    for (const id of seed.task.f2p_ids) expect(result[id], id).toBe('fail');
    for (const id of seed.task.p2p_ids) expect(result[id], id).toBe('pass');
  }, 60_000);

  it('run mode executes visible tests only; public results hide hidden-test details', async () => {
    const run = ok(await runTests(seedRequest(seed.starter, 'run'), context()));
    expect(run.total).toBe(2);
    expect(run.tests.every(test => test.visibility === 'visible')).toBe(true);
    expect(run.stdout).not.toContain('test_hidden');
    const submit = ok(await runTests(seedRequest(seed.starter, 'submit'), context()));
    const exposed = JSON.stringify(publicRun(submit));
    expect(exposed).not.toContain('test_hidden');
    expect(exposed).not.toContain('peak_requests([11])');
    expect(publicRun(submit).hidden).toEqual({ passed: 2, total: 3 });
  }, 60_000);

  it('infinite loop times out and the container is removed', async () => {
    const result = ok(await runTests(fixtureRequest('infinite_loop', { limits: { ...limits, wall_time_ms: 3000 } }), context()));
    expect(result.timed_out).toBe(true);
    expect(result.tests.every(test => test.status === 'timeout')).toBe(true);
    expect(leftoverContainers()).toBe('');
  }, 60_000);

  it('huge output is capped per stream and still graded', async () => {
    // R3: the candidate's own prints arrive on stderr (worker); stdout is the grader's pytest text.
    const result = ok(await runTests(fixtureRequest('huge_output'), context()));
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(limits.output_bytes);
    expect(Buffer.byteLength(result.stderr)).toBeGreaterThan(limits.output_bytes - 4);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(limits.output_bytes);
    expect(result.tests.every(test => test.status === 'fail')).toBe(true);
  }, 60_000);

  it('the trusted grader container itself has no network and a read-only filesystem (probe tests)', async () => {
    const probe = testFile(`${fixtures}/cases/isolation_probe`, 'tests/test_isolation.py', 'visible');
    const result = ok(await runTests(fixtureRequest('ok', { tests: [...baseTests, probe] }), context()));
    expect(statuses(result)).toEqual(Object.fromEntries([...baseTests, probe].flatMap(t => t.ids).map(id => [id, 'pass'])));
  }, 60_000);

  it('deleting tests at import does not change the authoritative tests', async () => {
    const result = ok(await runTests(fixtureRequest('delete_tests'), context()));
    expect(result.total).toBe(4);
    expect(result.passed).toBeLessThan(4);
    expect(result.tests.some(test => test.status === 'fail')).toBe(true);
  }, 60_000);

  it.each(['exit_at_import', 'hard_exit', 'syntax_error'])('%s never produces a passing grade', async name => {
    const result = ok(await runTests(fixtureRequest(name), context()));
    expect(result.passed).toBe(0);
    expect(result.tests.every(test => test.status === 'error')).toBe(true);
  }, 60_000);

  it('forge_report: the forged report never reaches the grader, so the buggy code is graded as buggy', async () => {
    // R2 could only detect this forgery (all error); with split containers it has no effect at all.
    const forged = statuses(ok(await runTests(fixtureRequest('forge_report'), context())));
    const buggy = statuses(ok(await runTests(fixtureRequest('buggy'), context())));
    expect(forged).toEqual(buggy);
    expect(Object.values(forged)).toContain('fail');
  }, 60_000);

  it('memory exhaustion is contained and graded as error', async () => {
    const result = ok(await runTests(fixtureRequest('memory_bomb'), context()));
    expect(result.passed).toBe(0);
    expect(result.tests.every(test => test.status === 'error' || test.status === 'timeout')).toBe(true);
  }, 60_000);

  it('Docker startup failures return SANDBOX_UNAVAILABLE instead of throwing', async () => {
    const missingImage = createDockerRunner({ image: 'torquecode-runner-python:does-not-exist' });
    expect(await missingImage(fixtureRequest('ok'), context())).toMatchObject({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE' });
    const missingDocker = createDockerRunner({ docker: 'definitely-not-docker' });
    expect(await missingDocker(fixtureRequest('ok'), context())).toMatchObject({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE' });
    expect(leftoverContainers()).toBe('');
  }, 60_000);
});
