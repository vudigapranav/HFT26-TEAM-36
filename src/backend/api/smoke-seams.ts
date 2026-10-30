import assert from 'node:assert/strict';
import { createDevPorts, fixtureProfile } from './dev-stubs.js';
import { publicTask } from './public-projections.js';
import { loadSeed } from '../runner/local/seed-runner.js';

export async function smokeSeams() {
  const ports = createDevPorts();
  const task = await loadSeed();
  const context = { signal: AbortSignal.timeout(30_000) };
  const session = { id: 'fixture-session', user_id: 'fixture-user', started_at: '2026-10-30T00:00:00Z', expires_at: '2026-10-30T01:00:00Z', current_tier: 'novice' as const, status: 'active' as const };
  const results = {
    runTests: await ports.runTests({ task_id: task.task_id, files: task.files, tests: task.tests, mode: 'run', limits: task.limits }, context),
    chat: await ports.chat({ messages: [], model: 'fixture', purpose: 'generation', max_tokens: 10 }, context),
    nextHint: await ports.nextHint({ task_id: task.task_id, level: 1 }, context),
    assistantReply: await ports.assistantReply({ task: publicTask(task), files: task.files, visible_failures: [], message: 'fixture', history: [] }, context),
    generateAssessment: await ports.generateAssessment({ profile: fixtureProfile, focus_lane: { domain: 'backend', skills: ['rest-apis'], topics: ['arrays'] }, progress: () => {} }, context),
    validateTask: await ports.validateTask({ task, claimed_topics: ['arrays'] }, context),
    parsePortfolio: ports.parsePortfolio({}),
    quiz: ports.quiz({ profile: fixtureProfile }),
    calculateAie: ports.calculateAie({ events: [], runs: [], task }),
    buildReport: ports.buildReport({ session, tasks: [task], runs: [], events: [] }),
  };
  assert.equal(results.runTests.kind, 'ok');
  assert.equal(results.generateAssessment.kind, 'unavailable');
  assert.equal(results.validateTask.kind, 'unavailable');
  assert.equal(results.calculateAie.kind, 'unavailable');
  return Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.kind]));
}

if (process.argv[1]?.endsWith('smoke-seams.ts')) console.log(JSON.stringify(await smokeSeams(), null, 2));
