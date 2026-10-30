import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import type { PrivateTask, Topic } from '../../contracts/internal.js';
import type { Ports } from '../../contracts/seams.js';
import { loadSeedBank } from '../../api/seed-bank.js';
import { createDockerRunner } from '../../runner/dockerRunner.js';
import { createValidationEngine } from '../../generation/validate.js';

const image = 'torquecode-runner-python:dev';
const dockerReady = spawnSync('docker', ['image', 'inspect', image], {
  stdio: 'ignore',
  timeout: 15_000,
}).status === 0;

const dockerRunner = createDockerRunner({ image });
const ctx = () => ({ signal: AbortSignal.timeout(120_000) });

async function seed(tier: 'novice' | 'adept' | 'master') {
  const bank = await loadSeedBank();
  const task = bank[tier]?.[0];
  if (!task) throw new Error(`Missing ${tier} reviewed task`);
  return structuredClone(task);
}

const claims = (task: PrivateTask): Topic[] => [...task.dsa_topics];

async function validate(
  task: PrivateTask,
  runner: Ports['runTests'] = dockerRunner,
  topics: Topic[] = claims(task),
) {
  const result = await createValidationEngine(runner)(
    { task, claimed_topics: topics }, ctx()
  );
  if (result.kind !== 'ok') throw new Error('Validation seam unavailable');
  return result.value;
}

const gate = (
  receipt: Awaited<ReturnType<typeof validate>>,
  name: string,
) => {
  const found = receipt.gates.find(g => g.gate === name);
  if (!found) throw new Error(`Missing validation gate ${name}`);
  return found;
};

describe('K5 static security and validation', () => {
  const mustNotRun = vi.fn<Ports['runTests']>(async () => {
    throw new Error('Invalid task reached the runner');
  });

  it('rejects an invalid trusted test manifest', async () => {
    mustNotRun.mockClear();
    const task = await seed('novice');
    task.tests[0]!.ids = [];

    const receipt = await validate(task, mustNotRun);
    expect(receipt.valid).toBe(false);
    expect(gate(receipt, 'schema').status).toBe('fail');
    expect(mustNotRun).not.toHaveBeenCalled();
  });

  it('rejects Python imports outside the allowlist', async () => {
    mustNotRun.mockClear();
    const task = await seed('novice');
    task.reference_files[0]!.content =
      'import subprocess\n' + task.reference_files[0]!.content;

    const receipt = await validate(task, mustNotRun);
    expect(receipt.valid).toBe(false);
    expect(gate(receipt, 'imports').status).toBe('fail');
    expect(mustNotRun).not.toHaveBeenCalled();
  });

  it('detects unclaimed advanced topics from Python AST', async () => {
    mustNotRun.mockClear();
    const task = await seed('novice');
    task.reference_files[0]!.content =
      'import heapq\n' + task.reference_files[0]!.content;

    const receipt = await validate(task, mustNotRun);
    expect(receipt.valid).toBe(false);
    expect(gate(receipt, 'topics').status).toBe('fail');
    expect(mustNotRun).not.toHaveBeenCalled();
  });

  it('rejects hints that contain reference implementation', async () => {
    mustNotRun.mockClear();
    const task = await seed('novice');
    task.hint_ladder[0] =
      '```python\n' + task.reference_files[0]!.content + '\n```';

    const receipt = await validate(task, mustNotRun);
    expect(receipt.valid).toBe(false);
    expect(gate(receipt, 'leakage').status).toBe('fail');
    expect(mustNotRun).not.toHaveBeenCalled();
  });

  it('rejects unsupported test fixture injection', async () => {
    mustNotRun.mockClear();
    const task = await seed('novice');
    const visible = task.tests.find(t => t.visibility === 'visible')!;
    visible.content = visible.content.replace(
      'def test_last_day_peak():',
      'def test_last_day_peak(monkeypatch):',
    );
    for (const test of task.visible_tests) {
      test.content = visible.content;
    }

    const receipt = await validate(task, mustNotRun);
    expect(receipt.valid).toBe(false);
    expect(gate(receipt, 'format').status).toBe('fail');
    expect(mustNotRun).not.toHaveBeenCalled();
  });

  it('fails closed when the trusted runner is unavailable', async () => {
    const task = await seed('novice');
    const unavailable: Ports['runTests'] = async () => ({
      kind: 'unavailable',
      code: 'SANDBOX_UNAVAILABLE',
      message: 'Docker daemon unavailable',
    });

    const receipt = await validate(task, unavailable);
    expect(receipt.valid).toBe(false);
    expect(gate(receipt, 'reference').status).toBe('skipped');
    expect(gate(receipt, 'starter').status).toBe('skipped');
  });

  it('rejects unsupported split-runner task format', async () => {
    const task = await seed('novice');
    const unsupported: Ports['runTests'] = async () => ({
      kind: 'unavailable',
      code: 'SANDBOX_UNAVAILABLE',
      message: 'Task not supported by the isolated runner',
    });

    const receipt = await validate(task, unsupported);
    expect(receipt.valid).toBe(false);
    expect(gate(receipt, 'format').status).toBe('fail');
  });
});

describe.skipIf(!dockerReady)('K5 with the real Docker runner', () => {
  it.each(['novice', 'adept', 'master'] as const)(
    '%s reviewed seed passes every validation gate',
    async tier => {
      const task = await seed(tier);
      const receipt = await validate(task);

      expect(receipt.valid, JSON.stringify(receipt, null, 2))
        .toBe(true);
      expect(receipt.gates.every(g => g.status === 'pass'),
        JSON.stringify(receipt, null, 2)).toBe(true);
      expect(gate(receipt, 'reference').status).toBe('pass');
      expect(gate(receipt, 'starter').status).toBe('pass');
    },
    120_000,
  );

  it('rejects an incorrect reference solution', async () => {
    const task = await seed('novice');
    task.reference_files[0]!.content =
      'def peak_requests(counts: list[int]) -> int:\n    return -1\n';

    const receipt = await validate(task);
    expect(receipt.valid).toBe(false);
    expect(gate(receipt, 'reference').status).toBe('fail');
  }, 120_000);

  it('rejects a starter that already passes all tests', async () => {
    const task = await seed('novice');
    task.files[0]!.content =
      'def peak_requests(counts: list[int]) -> int:\n' +
      '    return max(counts, default=0)\n';

    const receipt = await validate(task);
    expect(receipt.valid).toBe(false);
    expect(gate(receipt, 'starter').status).toBe('fail');
  }, 120_000);
});

it('K5 returns a complete receipt for malformed tasks', async () => {
  const task = await seed('novice');
  task.tests[0]!.ids = [];

  const receipt = await validate(task);

  expect(receipt.valid).toBe(false);
  expect(receipt.gates).toHaveLength(10);
  expect(gate(receipt, 'schema').status).toBe('fail');
  expect(receipt.gates.slice(1).every(g => g.status === 'skipped'))
    .toBe(true);
});

it('K5 rejects fabricated incomplete runner results', async () => {
  const task = await seed('novice');

  const dishonest: Ports['runTests'] = async input => ({
    kind: 'ok',
    value: {
      run_id: 'fabricated',
      task_id: input.task_id,
      mode: input.mode,
      tests: [{
        id: input.tests[0]!.ids[0]!,
        visibility: 'visible',
        status: 'pass',
        duration_ms: 0,
      }],
      passed: 1,
      total: 1,
      stdout: '',
      stderr: '',
      timed_out: false,
    },
  });

  const receipt = await validate(task, dishonest);

  expect(receipt.valid).toBe(false);
  expect(gate(receipt, 'reference').status).toBe('fail');
});

// Contract receipts describe only the checks that actually ran.
it('does not claim statement-example or brute-force validation for undeclared artifacts', async () => {
  const task = await seed('novice');
  let invocation = 0;
  const runner: Ports['runTests'] = async input => {
    const starter = ++invocation === 4;
    const tests = input.tests.flatMap(test => test.ids.map(id => ({
      id, visibility: test.visibility, duration_ms: 0,
      status: starter && task.f2p_ids.includes(id) ? 'fail' as const : 'pass' as const,
    })));
    return { kind: 'ok', value: {
      run_id: `receipt-${invocation}`, task_id: input.task_id, mode: input.mode,
      tests, passed: tests.filter(t => t.status === 'pass').length, total: tests.length,
      stdout: '', stderr: '', timed_out: false,
    } };
  };
  const receipt = await validate(task, runner);
  expect(receipt.valid).toBe(true);
  expect(gate(receipt, 'examples').reason)
    .toBe('No statement examples declared; covered by visible tests');
  expect(gate(receipt, 'differential').reason)
    .toBe('Reference deterministic across 3 runs (no brute-force oracle supplied)');
  expect(invocation).toBe(4);
});

it('rejects Master tasks without a named performance test', async () => {
  const task = await seed('novice');
  task.tier = 'master';
  let invocation = 0;
  const runner: Ports['runTests'] = async input => {
    const starter = ++invocation === 4;
    const tests = input.tests.flatMap(test => test.ids.map(id => ({
      id, visibility: test.visibility, duration_ms: 0,
      status: starter && task.f2p_ids.includes(id) ? 'fail' as const : 'pass' as const,
    })));
    return { kind: 'ok', value: {
      run_id: `perf-${invocation}`, task_id: input.task_id, mode: input.mode,
      tests, passed: tests.filter(t => t.status === 'pass').length, total: tests.length,
      stdout: '', stderr: '', timed_out: false,
    } };
  };
  expect(gate(await validate(task, runner), 'performance').status).toBe('fail');
});
