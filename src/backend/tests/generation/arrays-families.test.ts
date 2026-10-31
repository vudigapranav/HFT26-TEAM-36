// Arrays-only Adept/Master families: every portfolio (the intake falls back to arrays) can
// reach all three question sets. Real R3 runner + real K5; no paid provider calls.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadSeedBank } from '../../api/seed-bank.js';
import { budgetOracle, families, familyTask, peakBucketOracle, prefixOracle, rollupOracle } from '../../generation/families.js';
import { createGenerator } from '../../generation/generate.js';
import { createValidationEngine } from '../../generation/validate.js';
import { createDockerRunner } from '../../runner/dockerRunner.js';
import type { CandidateProfile, ChatRequest, Topic } from '../../contracts/internal.js';
import type { Ports } from '../../contracts/seams.js';

const ready = spawnSync('docker', ['image', 'inspect', 'torquecode-runner-python:dev'], { stdio: 'ignore', timeout: 5000 }).status === 0;
const ctx = () => ({ signal: AbortSignal.timeout(180000) });
const profile = (claimed_topics: Topic[]): CandidateProfile => ({ domain: 'web', domain_confidence: 1, claimed_topics, tech_stack: ['react'], skills: ['rest-apis'] });
const down: Ports['chat'] = async () => ({ kind: 'unavailable', code: 'LLM_UNAVAILABLE', message: 'not configured' });

describe('arrays-only family oracles', () => {
  it('answer hand-derived anchors', () => {
    expect(prefixOracle([3, 1, 4])).toEqual([0, 3, 4, 8]);
    expect(budgetOracle([2, 0, 5], [[0, 2], [1, 3]], 2)).toEqual({ kind: 'value', value: [
      { start: 0, end_exclusive: 2, errors: 2, over_budget: false },
      { start: 1, end_exclusive: 3, errors: 5, over_budget: true }] });
    expect(budgetOracle([1], [[0, 2]], 1).kind).toBe('raises');
    expect(rollupOracle([4, 1, 0, 3, 2], 2)).toEqual([5, 3, 2]);
    expect(peakBucketOracle([2, 3, 5, 0, 1, 4], 2)).toEqual({ index: 0, total: 5 });
    expect(peakBucketOracle([], 2)).toBeNull();
  });
  it('register as arrays-only Adept and Master families with F2P coverage', async () => {
    const registry = await families();
    const rollup = registry.find(f => f.id === 'bucket_rollup_v1')!, budget = registry.find(f => f.id === 'error_budget_v1')!;
    expect([rollup.base.tier, rollup.base.dsa_topics]).toEqual(['adept', ['arrays']]);
    expect([budget.base.tier, budget.base.dsa_topics]).toEqual(['master', ['arrays']]);
    for (const f of [rollup, budget]) {
      const task = familyTask(f, 'web');
      expect(task.f2p_ids.some(id => id.startsWith('tests/test_visible.py'))).toBe(true);
      expect(task.p2p_ids.length).toBeGreaterThan(0);
    }
    expect(familyTask(budget, 'web').f2p_ids).toContain('tests/test_hidden.py::test_budget_report_performance');
  });
});

describe.skipIf(!ready)('arrays-only families through real R3 and independent K5', () => {
  const runTests = createDockerRunner();
  const validate = createValidationEngine(runTests);
  it.each([['bucket_rollup_v1'], ['error_budget_v1']])('%s: reviewed seed and personalised task are both certified', async id => {
    const family = (await families()).find(f => f.id === id)!;
    for (const task of [family.base, familyTask(family, 'security', 'reliability')]) {
      const result = await validate({ task, claimed_topics: ['arrays'] }, ctx());
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;
      expect(result.value.gates.filter(g => g.status !== 'pass' && g.status !== 'not_applicable'), JSON.stringify(result.value.gates)).toEqual([]);
      expect([result.value.valid, result.value.semantic_verified, result.value.family_id]).toEqual([true, true, id]);
    }
  }, 300000);
  it('normal-web claims (arrays, hashing, two_pointers) get all three certified sets on provider outage', async () => {
    const generate = createGenerator({ chat: down, runTests, validateTask: validate, seedBank: () => loadSeedBank(), log: () => {} });
    const result = await generate({ profile: profile(['arrays', 'hashing', 'two_pointers']), focus_lane: { domain: 'web', topics: ['arrays'], skills: [] }, progress: () => {} }, ctx());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect([result.value.novice.tier, result.value.adept.tier, result.value.master.tier]).toEqual(['novice', 'adept', 'master']);
    expect(result.value.master.family_id).toBe('error_budget_v1');
    expect(result.value.master.dsa_topics.every(t => ['arrays', 'hashing', 'two_pointers'].includes(t))).toBe(true);
  }, 300000);
  it('an arrays-only portfolio is personalised from model selection within its claims', async () => {
    const seen: ChatRequest[] = [];
    const chat: Ports['chat'] = async input => {
      seen.push(input);
      const allowed = JSON.parse(input.messages[1]!.content).families as { family_id: string }[];
      return { kind: 'ok', value: { model: 'test', content: JSON.stringify({ family_id: allowed[0]!.family_id, scenario_id: 'analytics' }) } };
    };
    const generate = createGenerator({ chat, runTests, validateTask: validate, seedBank: () => loadSeedBank(), log: () => {} });
    const result = await generate({ profile: profile(['arrays']), focus_lane: { domain: 'web', topics: ['arrays'], skills: [] }, progress: () => {} }, ctx());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect([result.value.adept.family_id, result.value.master.family_id]).toEqual(['bucket_rollup_v1', 'error_budget_v1']);
    // Master stays the reviewed seed by design (pinned performance workload); lower sets are personalised.
    expect([result.value.novice.source, result.value.adept.source, result.value.master.source]).toEqual(['generated', 'generated', 'seed_bank']);
    expect(Object.values(result.value).every(t => t.dsa_topics.every(x => x === 'arrays'))).toBe(true);
    for (const request of seen) for (const f of JSON.parse(request.messages[1]!.content).families as { family_id: string }[])
      expect(['request_peak_v1', 'second_largest_v1', 'bucket_rollup_v1', 'error_budget_v1']).toContain(f.family_id);
  }, 300000);
});
