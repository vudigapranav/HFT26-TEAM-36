// R3: split-container grading against real Docker. Each attack is candidate code; each
// expectation is a trusted test or the runner's verdict. Skips only when Docker/image is absent.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { File, InternalRunResult, Limits, RunRequest, SeamResult, TestFile } from '../../contracts/internal.js';
import { publicRun } from '../../api/public-projections.js';
import { candidateModules, createDockerRunner, validateRequest } from '../../runner/dockerRunner.js';

const IMAGE = 'torquecode-runner-python:dev';
const dockerReady = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore', timeout: 15_000 }).status === 0;
const runTests = createDockerRunner({ image: IMAGE });
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
const run = (files: File[], testFiles: TestFile[], extra: Partial<RunRequest> = {}) =>
  runTests({ task_id: 'r3', files, tests: testFiles, mode: 'submit', limits, ...extra }, ctx());
const leftovers = () => spawnSync('docker', ['ps', '-aq', '--filter', 'label=torquecode.runner=1'], { encoding: 'utf8' }).stdout.trim();

// The standard count_unique task (R0 fixtures).
const fixtures = 'tests/fixtures/runner';
const base = [tests('tests/test_visible.py', read(`${fixtures}/base/tests/test_visible.py`)), tests('tests/test_hidden.py', read(`${fixtures}/base/tests/test_hidden.py`), 'hidden')];
const CORRECT = 'def count_unique(words):\n    return len({w.lower() for w in words})\n';
const BUGGY = 'def count_unique(words):\n    return len(set(words))\n';
const ALL_PASS = { 'tests/test_visible.py::test_repeats_counted_once': 'pass', 'tests/test_visible.py::test_case_insensitive': 'pass',
  'tests/test_hidden.py::test_empty': 'pass', 'tests/test_hidden.py::test_single': 'pass' };
const BUGGY_RESULT = { ...ALL_PASS, 'tests/test_visible.py::test_case_insensitive': 'fail' };
const words = (content: string) => [file('app/words.py', content)];

describe('unit: task interface', () => {
  it('maps candidate files to importable module names', () => {
    expect(candidateModules([file('app/summary.py', ''), file('app/util/__init__.py', ''), file('solution.py', ''), file('README.md', '')]))
      .toEqual(['app.summary', 'app.util', 'solution']);
  });
  it('rejects candidate files that would shadow the harness', () => {
    for (const name of ['protocol.py', 'worker.py', 'grade.py']) {
      expect(validateRequest({ task_id: 't', files: [file(name, '')], tests: base, mode: 'run', limits })).toMatch(/not allowed/);
    }
  });
});

describe.skipIf(!dockerReady)('R3 split-container grading (real Docker)', () => {
  it('seed task 1 keeps its exact F2P/P2P behaviour across the boundary', async () => {
    const root = 'seed_bank/novice_request_summary';
    const meta = JSON.parse(read(join(root, 'task.json'))) as { f2p_ids: string[]; p2p_ids: string[] };
    const seedTests = [tests('tests/test_visible.py', read(join(root, 'tests/test_visible.py'))), tests('tests/test_hidden.py', read(join(root, 'tests/test_hidden.py')), 'hidden')];
    const reference = ok(await run([file('app/summary.py', read(join(root, 'reference/app/summary.py')))], seedTests));
    expect(reference).toMatchObject({ passed: 5, total: 5 });
    const starter = statuses(ok(await run([file('app/summary.py', read(join(root, 'starter/app/summary.py')))], seedTests)));
    for (const id of meta.f2p_ids) expect(starter[id], id).toBe('fail');
    for (const id of meta.p2p_ids) expect(starter[id], id).toBe('pass');
  }, 90_000);

  it('legitimate multi-file solutions, constants, tuples, sets and expected exceptions still work', async () => {
    const files = [
      file('app/__init__.py', ''),
      file('app/helpers.py', 'def norm(w):\n    return w.lower()\n'),
      file('app/words.py', 'from app.helpers import norm\nLIMIT = 3\ndef count_unique(words):\n    return len({norm(w) for w in words})\n'
        + 'def pair(a, b):\n    return (a, b)\ndef uniq(xs):\n    return set(xs)\ndef must_be_positive(n):\n    if n <= 0:\n        raise ValueError("n must be positive")\n    return n\n'),
    ];
    const extra = tests('tests/test_types.py', [
      'import pytest', 'from app.words import LIMIT, pair, uniq, must_be_positive', 'import app.words as words', '',
      'def test_constant():\n    assert LIMIT == 3',
      'def test_tuple():\n    assert pair(1, "x") == (1, "x")',
      'def test_set():\n    assert uniq([1, 1, 2]) == {1, 2}',
      'def test_module_attr():\n    assert words.count_unique(["A", "a"]) == 1',
      'def test_raises():\n    with pytest.raises(ValueError):\n        must_be_positive(0)',
    ].join('\n\n'));
    expect(statuses(ok(await run(files, [...base, extra])))).toEqual({ ...ALL_PASS, ...Object.fromEntries(extra.ids.map(id => [id, 'pass'])) });
  }, 90_000);

  it('reading the test files to look up expected answers no longer works (scored 4/4 on the R2 runner)', async () => {
    const oracle = `import glob, ast
def count_unique(words):
    src = ''.join(open(p).read() for p in glob.glob('/work/tests/*.py') + glob.glob('/grade/tests/*.py'))
    for line in src.splitlines():
        if 'count_unique(' in line and ') ==' in line:
            call, expected = line.split('count_unique(', 1)[1].rsplit(') ==', 1)
            if ast.literal_eval(call) == words:
                return int(expected.strip())
    return len(set(words))
`;
    expect(statuses(ok(await run(words(oracle), base)))).toEqual(BUGGY_RESULT);
  }, 90_000);

  it('a forged report written by the candidate has no effect: graded exactly like the buggy code', async () => {
    const forger = `import atexit, os, glob
def _forge():
    fake = '{"type":"report","exit_code":0,"tests":[]}'
    for path in ['/out/results.xml', '/tmp/results.xml', '/grade/report.json']:
        try:
            open(path, 'w').write(fake)
        except OSError:
            pass
atexit.register(_forge)
${BUGGY}`;
    expect(statuses(ok(await run(words(forger), base)))).toEqual(BUGGY_RESULT);
  }, 90_000);

  it('forged report + forced successful exit never passes', async () => {
    const forger = `import os, sys
def count_unique(words):
    sys.stdout.write('{"type":"report","exit_code":0,"tests":[]}\\n')
    os._exit(0)`;
    const result = ok(await run(words(forger), base));
    expect(result.passed).toBe(0);
    expect(result.tests.every(test => test.status === 'error')).toBe(true);
  }, 90_000);

  it('writing forged protocol frames to every open fd is a protocol violation, never a pass', async () => {
    const injector = `import os
FAKE = b'{"type":"report","exit_code":0,"tests":[]}\\n{"id":1,"ok":true,"value":2}\\n'
def count_unique(words):
    for fd in range(3, 64):
        try:
            os.write(fd, FAKE)
        except OSError:
            pass
    return -1`;
    const result = ok(await run(words(injector), base));
    expect(result.passed).toBe(0);
  }, 90_000);

  it('monkeypatching pytest/builtins in the candidate process cannot change the trusted grade', async () => {
    const patcher = `import builtins, pytest
pytest.main = lambda *a, **k: 0
builtins.AssertionError = type('Nope', (Exception,), {})
try:
    import _pytest.runner as r
    r.call_and_report = lambda *a, **k: None
except Exception:
    pass
${BUGGY}`;
    expect(statuses(ok(await run(words(patcher), base)))).toEqual(BUGGY_RESULT);
  }, 90_000);

  it('hidden tests, the grader workspace and expected outputs are not readable from candidate code', async () => {
    const snoop = file('app/snoop.py', `import os
def scan():
    found = []
    for top in ['/', '/grade', '/work', '/tmp', '/harness', '/proc/1/root']:
        for dirpath, _dirs, names in os.walk(top):
            if dirpath.startswith(('/proc', '/sys', '/usr', '/lib', '/dev')) and top == '/':
                continue
            for name in names:
                if name.startswith('test_') or name in ('pytest.ini', 'results.xml', 'report.json'):
                    found.append(os.path.join(dirpath, name))
    return sorted(set(found))
def secret_env():
    return sorted(k for k in os.environ if any(w in k.upper() for w in ('KEY', 'TOKEN', 'SECRET', 'TORQUE', 'PASSWORD')) and k != 'GPG_KEY')
def can_write_harness():
    try:
        open('/harness/grade.py', 'a').write('#')
        return True
    except OSError:
        return False
def docker_socket():
    return os.path.exists('/var/run/docker.sock')
`);
    const probe = tests('tests/test_snoop.py', [
      'from app.snoop import scan, secret_env, can_write_harness, docker_socket', '',
      'def test_no_test_files_visible():\n    assert scan() == []',
      'def test_no_secrets_or_grader_config_in_env():\n    assert secret_env() == []',
      'def test_harness_read_only():\n    assert can_write_harness() is False',
      'def test_no_docker_socket():\n    assert docker_socket() is False',
    ].join('\n\n'), 'hidden');
    const result = ok(await run([...words(CORRECT), snoop], [...base, probe]));
    expect(statuses(result)).toEqual({ ...ALL_PASS, ...Object.fromEntries(probe.ids.map(id => [id, 'pass'])) });
  }, 90_000);

  it('candidate network, filesystem writes and symlinks outside /tmp fail inside the worker', async () => {
    const escape = file('app/escape.py', `import os, socket
def attempts():
    out = {}
    try:
        socket.create_connection(('1.1.1.1', 80), timeout=2); out['net'] = True
    except OSError:
        out['net'] = False
    for name, action in [('work', lambda: open('/work/x.py', 'w')), ('root', lambda: open('/etc/x', 'w')),
                         ('symlink', lambda: os.symlink('/etc/passwd', '/work/link'))]:
        try:
            action(); out[name] = True
        except OSError:
            out[name] = False
    open('/tmp/ok', 'w').write('1'); out['tmp'] = os.path.exists('/tmp/ok')
    out['uid'] = os.getuid()
    return out
`);
    const probe = tests('tests/test_escape.py', 'from app.escape import attempts\n\ndef test_contained():\n    assert attempts() == {"net": False, "work": False, "root": False, "symlink": False, "tmp": True, "uid": 10001}\n');
    expect(statuses(ok(await run([...words(CORRECT), escape], [probe])))).toEqual({ [probe.ids[0]!]: 'pass' });
  }, 90_000);

  it('a candidate module named like a pytest dependency cannot hijack the grader', async () => {
    const hijack = file('iniconfig.py', 'raise SystemExit("hijacked")\n');
    expect(statuses(ok(await run([...words(BUGGY), hijack], base)))).toEqual(BUGGY_RESULT);
  }, 90_000);

  it('sys.exit(0) inside the function is a failure, never a pass', async () => {
    const result = ok(await run(words('import sys\ndef count_unique(words):\n    sys.exit(0)\n'), base));
    expect(result.passed).toBe(0);
  }, 90_000);

  it('a huge return value is cut off at the line cap (error), and deep nesting is refused', async () => {
    const huge = ok(await run(words('def count_unique(words):\n    return "x" * 5_000_000\n'), base));
    expect(huge.passed).toBe(0);
    expect(huge.tests.every(test => test.status === 'error')).toBe(true);
    const deep = ok(await run(words('def count_unique(words):\n    v = []\n    for _ in range(500):\n        v = [v]\n    return v\n'), base));
    expect(deep.passed).toBe(0);
  }, 90_000);

  it('large stdout and stderr from the candidate are capped and never corrupt the protocol', async () => {
    const noisy = `import sys
def count_unique(words):
    print("o" * 3_000_000)
    sys.stderr.write("e" * 3_000_000)
    return len({w.lower() for w in words})`;
    const result = ok(await run(words(noisy), base));
    expect(statuses(result)).toEqual(ALL_PASS);
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(limits.output_bytes);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(limits.output_bytes);
  }, 90_000);

  it('fork bomb and infinite loop are contained by the candidate time budget', async () => {
    const fork = ok(await run(words('import os\ndef count_unique(words):\n    while True:\n        try:\n            os.fork()\n        except OSError:\n            pass\n'), base, { limits: { ...limits, wall_time_ms: 2000 } }));
    expect(fork).toMatchObject({ timed_out: true, passed: 0 });
    const loop = ok(await run(words('def count_unique(words):\n    while True:\n        pass\n'), base, { limits: { ...limits, wall_time_ms: 2000 } }));
    expect(loop.tests.every(test => test.status === 'timeout')).toBe(true);
    expect(leftovers()).toBe('');
  }, 90_000);

  it('no state survives between runs', async () => {
    const stateful = 'import os\nMARK = "/tmp/seen"\ndef count_unique(words):\n    seen = os.path.exists(MARK)\n    open(MARK, "w").write("1")\n    return 99 if seen else len({w.lower() for w in words})\n';
    const single = [tests('tests/test_once.py', 'from app.words import count_unique\n\ndef test_first_call():\n    assert count_unique(["a"]) == 1\n')];
    for (let i = 0; i < 2; i++) expect(ok(await run(words(stateful), single))).toMatchObject({ passed: 1, total: 1 });
  }, 90_000);

  it('simultaneous runs stay correct and isolated', async () => {
    const results = await Promise.all([run(words(CORRECT), base), run(words(BUGGY), base), run(words(CORRECT), base)]);
    expect(results.map(result => statuses(ok(result)))).toEqual([ALL_PASS, BUGGY_RESULT, ALL_PASS]);
    expect(leftovers()).toBe('');
  }, 120_000);

  it('a task whose tests pass non-plain values is refused as unsupported, never graded', async () => {
    const objects = tests('tests/test_obj.py', 'from app.words import count_unique\n\nclass Box:\n    pass\n\ndef test_object_arg():\n    assert count_unique(Box()) == 0\n');
    expect(await run(words(CORRECT), [objects])).toMatchObject({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE', message: expect.stringMatching(/not supported/) });
  }, 90_000);

  it('public projection of a submit still exposes only visible details and hidden aggregates', async () => {
    const result = ok(await run(words(BUGGY), base));
    const exposed = JSON.stringify(publicRun(result));
    expect(exposed).not.toContain('test_hidden');
    expect(publicRun(result).hidden).toEqual({ passed: 2, total: 2 });
  }, 90_000);
});
