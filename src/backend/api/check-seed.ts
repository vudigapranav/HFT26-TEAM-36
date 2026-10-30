import assert from 'node:assert/strict';
import { loadSeed, runSeedTests } from '../runner/local/seed-runner.js';

export async function checkSeed() {
  const task = await loadSeed();
  const context = { signal: AbortSignal.timeout(30_000) };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await runSeedTests({ task_id: task.task_id, files: task.reference_files, tests: task.tests, mode: 'submit', limits: task.limits }, context);
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') throw new Error('Reference did not execute');
    assert.equal(result.value.passed, result.value.total);
    assert.equal(result.value.total, 5);
  }
  const starter = await runSeedTests({ task_id: task.task_id, files: task.files, tests: task.tests, mode: 'submit', limits: task.limits }, context);
  assert.equal(starter.kind, 'ok');
  if (starter.kind !== 'ok') throw new Error('Starter did not execute');
  for (const id of task.f2p_ids) assert.equal(starter.value.tests.find(test => test.id === id)?.status, 'fail', id);
  for (const id of task.p2p_ids) assert.equal(starter.value.tests.find(test => test.id === id)?.status, 'pass', id);
  assert.equal(starter.value.tests.some(test => test.status === 'error'), false);
  return { reference_runs: 3, reference_passed: 5, starter_f2p_failed: task.f2p_ids.length, starter_p2p_passed: task.p2p_ids.length };
}

if (process.argv[1]?.endsWith('check-seed.ts')) console.log(JSON.stringify(await checkSeed()));
