// Runner admission control: process-wide FIFO limit on whole Run/Submit operations.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { File, Limits, RunRequest, TestFile } from '../../contracts/internal.js';
import { RunnerAdmission, createDockerRunner, runnerAdmission } from '../../runner/dockerRunner.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const waitFor = async (condition: () => boolean, ms = 15_000) => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not reached');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

describe('RunnerAdmission (unit, deterministic)', () => {
  const signal = () => new AbortController().signal;

  it('admits up to the limit at once, then queues FIFO', async () => {
    const admission = new RunnerAdmission(2, 4);
    const a = await admission.acquire(signal());
    const b = await admission.acquire(signal());
    expect(a).toBeTypeOf('function');
    expect(b).toBeTypeOf('function');
    const order: string[] = [];
    const c = admission.acquire(signal()).then(release => { order.push('c'); return release; });
    const d = admission.acquire(signal()).then(release => { order.push('d'); return release; });
    await tick();
    expect(admission.stats()).toMatchObject({ running: 2, queued: 2 });
    a!();
    const releaseC = await c;
    await tick();
    expect(order).toEqual(['c']);
    b!();
    const releaseD = await d;
    expect(order).toEqual(['c', 'd']);
    releaseC!(); releaseD!();
    expect(admission.stats()).toMatchObject({ running: 0, queued: 0 });
  });

  it('refuses at once when the queue is full', async () => {
    const admission = new RunnerAdmission(1, 1);
    const running = await admission.acquire(signal());
    const queued = admission.acquire(signal());
    expect(await admission.acquire(signal())).toBeNull();
    running!();
    (await queued)!();
    expect(admission.stats()).toMatchObject({ running: 0, queued: 0 });
  });

  it('a queued abort rejects immediately, leaves the queue and never takes a slot', async () => {
    const admission = new RunnerAdmission(1, 4);
    const running = await admission.acquire(signal());
    const controller = new AbortController();
    const waiting = admission.acquire(controller.signal);
    const behind = admission.acquire(signal());
    await tick();
    controller.abort(new Error('candidate left'));
    await expect(waiting).rejects.toThrow('candidate left');
    expect(admission.stats()).toMatchObject({ running: 1, queued: 1 });
    running!();
    (await behind)!(); // the next in line gets the slot, not the aborted one
    expect(admission.stats()).toMatchObject({ running: 0, queued: 0 });
    expect(() => admission.acquire(AbortSignal.abort(new Error('already gone')))).toThrow('already gone');
  });

  it('releasing twice frees exactly one slot', async () => {
    const admission = new RunnerAdmission(1, 4);
    const release = await admission.acquire(signal());
    const next = admission.acquire(signal());
    release!(); release!();
    const second = await next;
    expect(admission.stats()).toMatchObject({ running: 1, queued: 0 });
    second!();
    expect(admission.stats()).toMatchObject({ running: 0, queued: 0 });
  });
});

// Integration through the real dockerRunner with the fake CLI ("gate" mode holds the grader).
const fixtures = 'tests/fixtures/runner';
const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const tests: TestFile[] = (['tests/test_visible.py', 'tests/test_hidden.py'] as const).map((path, i) => {
  const content = read(join(fixtures, 'base', path));
  return { path, content, visibility: i === 0 ? 'visible' : 'hidden', ids: [...content.matchAll(/^def (test_\w+)/gm)].map(m => `${path}::${m[1]}`) };
});
const files: File[] = [{ path: 'app/words.py', content: read(`${fixtures}/cases/ok/candidate/app/words.py`), editable: true }];
const limits: Limits = { wall_time_ms: 5000, memory_mb: 128, cpu_count: 1, pids: 32, output_bytes: 65536 };
const request: RunRequest = { task_id: 'admission', files, tests, mode: 'run', limits };
const scratch = mkdtempSync(join(tmpdir(), 'torquecode-admission-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function gate(mode = 'gate', extra: { controlTimeoutMs?: number; startupBudgetMs?: number } = {}) {
  const modeFile = join(scratch, `mode-${Math.random().toString(36).slice(2)}`);
  writeFileSync(modeFile, mode);
  const make = () => createDockerRunner({ image: 'fake', docker: process.execPath, dockerArgs: [resolve(fixtures, 'fake-docker.mjs'), modeFile], ...extra });
  return {
    make,
    started: () => readdirSync(scratch).filter(name => name.startsWith(`${modeFile.split(/[\\/]/).pop()}.started.`)).length,
    launches: () => (existsSync(`${modeFile}.runs`) ? read(`${modeFile}.runs`).trim().split('\n').filter(Boolean).length : 0),
    open: () => writeFileSync(`${modeFile}.go`, ''),
  };
}
const ctx = (signal: AbortSignal = AbortSignal.timeout(60_000)) => ({ signal });

describe('admission through dockerRunner (fake CLI)', () => {
  it('uses the configured defaults: 2 running, 8 queued', () => {
    expect(runnerAdmission.stats()).toMatchObject({ maxConcurrent: 2, maxQueue: 8, running: 0, queued: 0 });
  });

  it('two runs go at once, the third waits; separate runner instances share the limit', async () => {
    const g = gate();
    const [one, two] = [g.make(), g.make()]; // two factories, one process-wide limit
    const runs = [one(request, ctx()), two(request, ctx()), one(request, ctx())];
    await waitFor(() => g.started() === 2);
    expect(runnerAdmission.stats()).toMatchObject({ running: 2, queued: 1 });
    expect(g.launches()).toBe(4); // 2 operations x (worker + grader); the third hasn't launched
    g.open();
    const results = await Promise.all(runs);
    expect(results.every(result => result.kind === 'ok' && result.value.passed === 2)).toBe(true);
    expect(g.launches()).toBe(6);
    expect(runnerAdmission.stats()).toMatchObject({ running: 0, queued: 0 });
  }, 60_000);

  it('a full queue answers "runner busy" at once, never a grade', async () => {
    const g = gate();
    const runner = g.make();
    const held = Array.from({ length: 10 }, () => runner(request, ctx()));
    await waitFor(() => g.started() === 2);
    await waitFor(() => runnerAdmission.stats().queued === 8);
    const started = Date.now();
    expect(await runner(request, ctx())).toEqual({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE', message: 'Sandbox unavailable: runner busy, try again shortly' });
    expect(Date.now() - started).toBeLessThan(1000);
    g.open();
    expect((await Promise.all(held)).every(result => result.kind === 'ok')).toBe(true);
    expect(runnerAdmission.stats()).toMatchObject({ running: 0, queued: 0 });
  }, 120_000);

  it('an operation aborted while queued rejects immediately and never launches Docker', async () => {
    const g = gate();
    const runner = g.make();
    const held = [runner(request, ctx()), runner(request, ctx())];
    await waitFor(() => g.started() === 2);
    const controller = new AbortController();
    const queued = runner(request, ctx(controller.signal));
    await waitFor(() => runnerAdmission.stats().queued === 1);
    controller.abort(new Error('candidate closed the tab'));
    await expect(queued).rejects.toThrow('candidate closed the tab');
    expect(runnerAdmission.stats()).toMatchObject({ running: 2, queued: 0 });
    g.open();
    await Promise.all(held);
    expect(g.launches()).toBe(4); // only the two admitted operations ever ran containers
    expect(runnerAdmission.stats()).toMatchObject({ running: 0, queued: 0 });
  }, 60_000);

  it('errors and timeouts release their slots; repeated runs leak nothing', async () => {
    const broken = createDockerRunner({ docker: 'definitely-not-docker-binary' });
    for (let i = 0; i < 5; i++) expect((await broken(request, ctx())).kind).toBe('unavailable');
    expect(runnerAdmission.stats()).toMatchObject({ running: 0, queued: 0 });

    const hung = gate('gate', { controlTimeoutMs: 300, startupBudgetMs: 300 }); // never opened: the grader hangs
    const timedOut = await hung.make()({ ...request, limits: { ...limits, wall_time_ms: 300 } }, ctx());
    expect(timedOut).toMatchObject({ kind: 'ok', value: { timed_out: true } });
    expect(runnerAdmission.stats()).toMatchObject({ running: 0, queued: 0 });

    const quick = gate('pass');
    const runner = quick.make();
    for (let i = 0; i < 6; i++) expect((await runner(request, ctx())).kind).toBe('ok');
    expect(runnerAdmission.stats()).toMatchObject({ running: 0, queued: 0 });
  }, 120_000);
});
