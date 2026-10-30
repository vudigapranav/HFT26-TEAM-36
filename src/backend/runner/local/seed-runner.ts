import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Context, InternalRunResult, PrivateTask, RunRequest, SeamResult, TestResult } from '../../contracts/internal.js';
import { seedDigest } from './seed-digest.js';
import { runTrustedProcess } from './process.js';

const artifactPaths = ['task.json', 'starter/app/summary.py', 'reference/app/summary.py', 'tests/test_visible.py', 'tests/test_hidden.py', 'hints.json'] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const unavailable = (): SeamResult<InternalRunResult> => ({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE', message: 'Only immutable seed-1 fixtures can run locally; candidate code requires the isolated runner' });

export async function loadSeed(backendRoot = process.cwd()): Promise<PrivateTask> {
  const root = join(backendRoot, 'seed_bank/novice_request_summary');
  const entries = await Promise.all(artifactPaths.map(async path => [path, await readFile(join(root, path), 'utf8')] as const));
  const digest = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  if (digest !== seedDigest) throw new Error('Trusted seed artifacts changed; review them and update the pinned digest explicitly');
  const data = Object.fromEntries(entries) as Record<typeof artifactPaths[number], string>;
  const metadata = JSON.parse(data['task.json']) as Omit<PrivateTask, 'files' | 'reference_files' | 'tests' | 'visible_tests' | 'hint_ladder'>;
  return {
    ...metadata,
    files: [{ path: 'app/summary.py', content: data['starter/app/summary.py'], editable: true }],
    reference_files: [{ path: 'app/summary.py', content: data['reference/app/summary.py'], editable: true }],
    visible_tests: ['test_last_day_peak', 'test_middle_day_peak'].map(name => ({ id: `tests/test_visible.py::${name}`, path: 'tests/test_visible.py', content: data['tests/test_visible.py'] })),
    tests: [
      { path: 'tests/test_visible.py', content: data['tests/test_visible.py'], visibility: 'visible', ids: ['tests/test_visible.py::test_last_day_peak', 'tests/test_visible.py::test_middle_day_peak'] },
      { path: 'tests/test_hidden.py', content: data['tests/test_hidden.py'], visibility: 'hidden', ids: ['tests/test_hidden.py::test_single_day', 'tests/test_hidden.py::test_empty', 'tests/test_hidden.py::test_zero_counts'] },
    ],
    hint_ladder: JSON.parse(data['hints.json']) as string[],
  };
}

export async function runSeedTests(input: RunRequest, context: Context): Promise<SeamResult<InternalRunResult>> {
  context.signal.throwIfAborted();
  const seed = await loadSeed();
  const reference = same(input.files, seed.reference_files);
  if (input.task_id !== seed.task_id || !['run', 'submit'].includes(input.mode) ||
      (!reference && !same(input.files, seed.files)) || !same(input.tests, seed.tests) || !same(input.limits, seed.limits)) return unavailable();

  const directory = await mkdtemp(join(tmpdir(), 'torquecode-seed-'));
  try {
    const work = join(directory, 'work');
    await mkdir(join(work, 'app'), { recursive: true });
    await mkdir(join(work, 'tests'));
    // Write only the verified in-memory artifacts, never caller-owned paths/content.
    const files = reference ? seed.reference_files : seed.files;
    await writeFile(join(work, 'app/summary.py'), files[0]!.content, { mode: 0o600 });
    const selected = seed.tests.filter(test => input.mode === 'submit' || test.visibility === 'visible');
    for (const test of selected) await writeFile(join(work, test.path), test.content, { mode: 0o600 });
    const reportPath = join(directory, 'report.json');
    const backendRoot = process.cwd();
    const execution = await runTrustedProcess(join(backendRoot, '.venv/bin/python'), [
      '-B', '-m', 'pytest', '-p', 'reporter', '-p', 'no:cacheprovider', '-q', ...selected.map(test => test.path),
    ], {
      cwd: work, signal: context.signal, timeout_ms: seed.limits.wall_time_ms, output_bytes: seed.limits.output_bytes,
      // Do not inherit API keys, database URLs, pytest options or user site packages.
      env: { PATH: '/usr/bin:/bin', HOME: directory, TMPDIR: directory, PYTHONNOUSERSITE: '1', PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1',
        PYTHONPATH: `${work}:${join(backendRoot, 'runner/local')}`, TORQUE_REPORT_PATH: reportPath },
    });
    if (execution.timed_out || execution.output_limited) throw new Error('Trusted seed execution exceeded its bounds');
    const raw: unknown = JSON.parse(await readFile(reportPath, 'utf8'));
    if (!raw || typeof raw !== 'object' || !('tests' in raw) || !Array.isArray(raw.tests)) throw new Error('Invalid pytest report');
    const tests = raw.tests as TestResult[];
    const expectedIds = selected.flatMap(test => test.ids).sort();
    if (!same(tests.map(test => test.id).sort(), expectedIds) || tests.some(test =>
      !['pass', 'fail', 'error'].includes(test.status) || !Number.isFinite(test.duration_ms) || test.duration_ms < 0)) throw new Error('Incomplete or invalid pytest test results');
    const passed = tests.filter(test => test.status === 'pass').length;
    if (execution.code !== (passed === tests.length ? 0 : 1)) throw new Error('Pytest exit code disagrees with structured results');
    return { kind: 'ok', value: {
      run_id: randomUUID(), task_id: seed.task_id, mode: input.mode,
      tests: tests.map(test => ({ ...test, visibility: selected.find(file => file.ids.includes(test.id))!.visibility })),
      passed, total: tests.length, stdout: execution.stdout, stderr: execution.stderr, timed_out: false,
    } };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
