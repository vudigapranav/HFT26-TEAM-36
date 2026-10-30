import { expect, it } from 'vitest';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSeed } from '../../api/check-seed.js';
import { loadSeed, runSeedTests } from '../../runner/local/seed-runner.js';
import { runTrustedProcess } from '../../runner/local/process.js';

it('proves real reference stability and starter F2P/P2P behavior', async () => {
  expect(await checkSeed()).toEqual({ reference_runs: 3, reference_passed: 5, starter_f2p_failed: 2, starter_p2p_passed: 3 });
});

it('runs visible tests only in run mode and refuses changed source, tests, paths and limits', async () => {
  const seed = await loadSeed();
  const input = { task_id: seed.task_id, files: seed.files, tests: seed.tests, mode: 'run' as const, limits: seed.limits };
  const context = { signal: AbortSignal.timeout(20_000) };
  const run = await runSeedTests(input, context);
  expect(run.kind).toBe('ok');
  if (run.kind !== 'ok') throw new Error('Seed did not execute');
  expect(run.value.total).toBe(2);
  expect(run.value.tests.every(test => test.visibility === 'visible')).toBe(true);
  expect(run.value.stdout).not.toContain('test_hidden');
  for (const changed of [
    { ...input, files: [{ ...seed.files[0]!, content: 'raise RuntimeError("must not execute")' }] },
    { ...input, files: [{ ...seed.files[0]!, path: '../escape.py' }] },
    { ...input, tests: [] },
    { ...input, limits: { ...seed.limits, wall_time_ms: 999_999 } },
  ]) expect(await runSeedTests(changed, context)).toMatchObject({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE' });
});

it('refuses seed artifacts changed on disk before executing them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'torquecode-tamper-test-'));
  try {
    await mkdir(join(directory, 'seed_bank'));
    await cp('seed_bank/novice_request_summary', join(directory, 'seed_bank/novice_request_summary'), { recursive: true });
    await writeFile(join(directory, 'seed_bank/novice_request_summary/reference/app/summary.py'), 'raise RuntimeError("must never run")');
    await expect(loadSeed(directory)).rejects.toThrow('Trusted seed artifacts changed');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('kills trusted processes at the deadline, caps combined output and supports cancellation', async () => {
  const base = { cwd: process.cwd(), env: { PATH: '/usr/bin:/bin' }, signal: AbortSignal.timeout(10_000), timeout_ms: 100, output_bytes: 1024 };
  const timedOut = await runTrustedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], base);
  expect(timedOut.timed_out).toBe(true);
  const capped = await runTrustedProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000))'], { ...base, timeout_ms: 5000 });
  expect(capped.output_limited).toBe(true);
  expect(Buffer.byteLength(capped.stdout) + Buffer.byteLength(capped.stderr)).toBeLessThanOrEqual(1024);
  const controller = new AbortController();
  const pending = runTrustedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { ...base, signal: controller.signal, timeout_ms: 5000 });
  setTimeout(() => controller.abort(), 50);
  await expect(pending).rejects.toThrow();
});

it.each([
  ['partial emoji on stdout', 'process.stdout.write("😀")', 1],
  ['partial emoji on stderr', 'process.stderr.write("😀")', 1],
  ['invalid UTF-8', 'process.stdout.write(Buffer.from([255,255]))', 2],
  ['combined streams', 'process.stdout.write("a"); process.stderr.write("😀")', 2],
] as const)('preserves the encoded byte cap for %s', async (_name, script, budget) => {
  const result = await runTrustedProcess(process.execPath, ['-e', script], {
    cwd: process.cwd(), env: { PATH: '/usr/bin:/bin' }, signal: AbortSignal.timeout(5000), timeout_ms: 1000, output_bytes: budget,
  });
  expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(budget);
});
