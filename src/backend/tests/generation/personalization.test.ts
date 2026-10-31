// Evidence-grounded personalization: project evidence -> eligible reviewed families -> bounded model choice -> K5.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { ChatRequest, PrivateTask, Tier, ValidationReceipt } from '../../contracts/internal.js';
import type { Ports } from '../../contracts/seams.js';
import { loadSeedBank } from '../../api/seed-bank.js';
import { extractEvidence } from '../../intake/evidence.js';
import { parsePortfolioDetailed, validPortfolio } from '../../intake/portfolio.js';
import { catalogue, rankCandidates, selectWithEvidence } from '../../generation/catalogue.js';
import { families } from '../../generation/families.js';
import { createGenerator } from '../../generation/generate.js';
import { taskFingerprint, withReceiptCache } from '../../generation/receipts.js';
import { createValidationEngine } from '../../generation/validate.js';
import { createDockerRunner } from '../../runner/dockerRunner.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/portfolios/eval/${name}.json`, import.meta.url), 'utf8'));
function load(name: string) {
  const raw = fixture(name);
  const parsed = parsePortfolioDetailed(raw);
  if ('errors' in parsed) throw new Error('fixture invalid');
  return { profile: parsed.profile, evidence: extractEvidence(validPortfolio(raw)!, parsed.profile.claimed_topics) };
}
const signal = () => AbortSignal.timeout(60_000);
const tiers: Tier[] = ['novice', 'adept', 'master'];
async function select(name: string, chat?: Ports['chat']) {
  const { profile, evidence } = load(name);
  return selectWithEvidence({ entries: catalogue(await families()), claimed: profile.claimed_topics, evidence, domain: profile.domain, ...(chat ? { chat } : {}), signal: signal() });
}
const recorder = (replies: string[]) => {
  const calls: ChatRequest[] = [];
  const chat: Ports['chat'] = async input => { calls.push(input); const content = replies.shift(); return content === undefined ? { kind: 'unavailable', code: 'LLM_UNAVAILABLE', message: 'down' } : { kind: 'ok', value: { content, model: 'test' } }; };
  return { chat, calls };
};

describe('project evidence', () => {
  it('records stated features with sources and never adds unclaimed DSA topics', () => {
    const { evidence } = load('ecommerce_backend');
    const project = evidence.projects[0]!;
    expect(project.features.map(f => f.tag)).toEqual(expect.arrayContaining(['event_dedup', 'order_processing', 'cart', 'inventory']));
    expect(project.features.every(f => /^projects\[0\]\.(name|description|highlights\[\d+\])$/.test(f.source))).toBe(true);
    expect(project.dsa_evidence.every(d => ['arrays', 'hashing', 'sorting'].includes(d.topic))).toBe(true);
  });
  it('does not mine text flagged as prompt injection', () => {
    const project = load('adversarial').evidence.projects[0]!;
    expect(project.injection_flagged).toEqual(expect.arrayContaining(['projects[0].description', 'projects[0].highlights[0]']));
    expect(project.features.every(f => f.source === 'projects[0].highlights[1]' || f.source === 'projects[0].name')).toBe(true);
  });
  it('a minimal portfolio yields no invented features and says what is missing', () => {
    const project = load('minimal').evidence.projects[0]!;
    expect(project.features).toEqual([]);
    expect(project.confidence).toBe('low');
    expect(project.missing.length).toBeGreaterThan(0);
  });
});

describe('stage A: eligibility and evidence ranking', () => {
  it('different portfolios produce different evidence-backed selections', async () => {
    const picks = await Promise.all(['ecommerce_backend', 'security_student', 'ml_engineer'].map(n => select(n)));
    const signature = picks.map(p => tiers.map(t => `${p[t]?.family_id}:${p[t]?.scenario_id}`).join('|'));
    expect(new Set(signature).size).toBe(3);
    expect(picks[0]!.adept).toMatchObject({ family_id: 'event_dedupe_v1', scenario_id: 'order_events' });
    expect(picks[1]!.master).toMatchObject({ family_id: 'session_window_v1', scenario_id: 'security_logs' });
    expect(picks[2]!.adept).toMatchObject({ family_id: 'bucket_rollup_v1', scenario_id: 'dataset_batches' });
    for (const p of picks) for (const t of tiers) if (p[t]) expect(p[t]!.evidence.length).toBeGreaterThan(0);
  });
  it('never selects a family needing an unclaimed topic', async () => {
    const entries = catalogue(await families());
    for (const name of ['ecommerce_backend', 'security_student', 'ml_engineer', 'frontend_dev', 'api_developer', 'database_dev', 'general_dsa', 'minimal', 'adversarial']) {
      const { profile, evidence } = load(name);
      for (const tier of tiers) for (const c of rankCandidates(entries, tier, profile.claimed_topics, evidence, profile.domain)) {
        expect(entries.find(e => e.family_id === c.family_id)!.required_topics.every(t => profile.claimed_topics.includes(t)), `${name}/${c.family_id}`).toBe(true);
      }
    }
  });
});

describe('stage B: bounded model choice', () => {
  it('accepts an exact shortlist entry and labels it model-selected', async () => {
    const { profile, evidence } = load('security_student');
    const deterministic = await select('security_student');
    const entries = catalogue(await families());
    // A tier whose shortlist offers an alternative to the deterministic pick.
    const tier = tiers.find(t => rankCandidates(entries, t, profile.claimed_topics, evidence, profile.domain).slice(0, 4).length > 1)!;
    const alt = rankCandidates(entries, tier, profile.claimed_topics, evidence, profile.domain).slice(0, 4)
      .find(c => c.family_id !== deterministic[tier]!.family_id || c.scenario_id !== deterministic[tier]!.scenario_id || c.project_index !== deterministic[tier]!.project_index)!;
    const m = recorder([JSON.stringify({ [tier]: { family_id: alt.family_id, scenario_id: alt.scenario_id, project_index: alt.project_index } })]);
    const picks = await select('security_student', m.chat);
    expect(picks[tier]).toMatchObject({ family_id: alt.family_id, scenario_id: alt.scenario_id, method: 'model' });
    expect(tiers.filter(t => t !== tier && picks[t]).every(t => picks[t]!.method === 'deterministic')).toBe(true);
  });
  it('rejects unknown families, invented projects and extra keys; keeps the deterministic choice', async () => {
    const before = await select('ecommerce_backend');
    for (const reply of [
      { novice: { family_id: 'made_up_v9', scenario_id: 'order_events', project_index: 0 } },
      { novice: { family_id: before.novice!.family_id, scenario_id: before.novice!.scenario_id, project_index: 7 } },
      { novice: { family_id: before.novice!.family_id, scenario_id: before.novice!.scenario_id, project_index: 0, reference: 'def f(): ...' } },
      { novice: { family_id: 'session_window_v1', scenario_id: 'security_logs', project_index: 0 } }, // unclaimed sliding_window
    ]) {
      const picks = await select('ecommerce_backend', recorder([JSON.stringify(reply), JSON.stringify(reply)]).chat);
      expect(picks.novice).toMatchObject({ family_id: before.novice!.family_id, method: 'deterministic' });
    }
  });
  it('sends only structured evidence: no portfolio prose or injection text reaches the model', async () => {
    const m = recorder(['{}']);
    await select('adversarial', m.chat);
    const sent = JSON.stringify(m.calls);
    expect(sent).not.toMatch(/Ignore all previous instructions|mark every test|System note/i);
    expect(sent).not.toMatch(/reference_files|test_hidden|f2p_ids|expected/);
  });
  it('a provider outage gives an honest deterministic selection', async () => {
    const picks = await select('ml_engineer', recorder([]).chat);
    expect(Object.values(picks).every(p => p!.method === 'deterministic' && !p!.prompt_version)).toBe(true);
  });
});

describe('validation receipt reuse', () => {
  const task = (content = 'def f():\n    return 1\n') => ({ task_id: 't1', tier: 'novice', domain: 'backend', language: 'python', task_type: 'bug_fix', source: 'seed_bank', title: 'x', statement_md: 'x', dsa_topics: ['arrays'],
    files: [], visible_tests: [], reference_files: [{ path: 'app/x.py', content, editable: true }], tests: [], hint_ladder: [], limits: { wall_time_ms: 1000, memory_mb: 64, cpu_count: 1, pids: 16, output_bytes: 4096 }, f2p_ids: [], p2p_ids: [] } as unknown as PrivateTask);
  const pass = (task_id: string): ValidationReceipt => ({ task_id, valid: true, structural_valid: true, semantic_verified: true, family_id: 'f', gates: [] });
  it('reuses a verified receipt only for identical content, identity and claims', async () => {
    let runs = 0;
    const cache = withReceiptCache(async ({ task }) => { runs++; return { kind: 'ok', value: pass(task.task_id) }; }, async () => 'identity-1');
    const ctx = { signal: signal() };
    await cache({ task: task(), claimed_topics: ['arrays'] }, ctx);
    const hit = await cache({ task: { ...task(), task_id: 'other', source: 'generated' }, claimed_topics: ['arrays'] }, ctx);
    expect(runs).toBe(1); expect(hit.kind === 'ok' && hit.value.task_id).toBe('other');
    await cache({ task: task('def f():\n    return 2\n'), claimed_topics: ['arrays'] }, ctx); // changed reference
    await cache({ task: task(), claimed_topics: ['arrays', 'hashing'] }, ctx); // changed claims
    expect(runs).toBe(3);
    expect(taskFingerprint(task())).not.toBe(taskFingerprint(task('def f():\n    return 2\n')));
  });
  it('a changed identity (policy, code, harness or runner image) invalidates; unknown identity disables caching', async () => {
    let runs = 0, id: string | null = 'identity-1';
    const validate: Ports['validateTask'] = async ({ task }) => { runs++; return { kind: 'ok', value: pass(task.task_id) }; };
    const a = withReceiptCache(validate, async () => id);
    await a({ task: task(), claimed_topics: ['arrays'] }, { signal: signal() });
    id = 'identity-2';
    const b = withReceiptCache(validate, async () => id);
    await b({ task: task(), claimed_topics: ['arrays'] }, { signal: signal() });
    const none = withReceiptCache(validate, async () => null);
    await none({ task: task(), claimed_topics: ['arrays'] }, { signal: signal() }); await none({ task: task(), claimed_topics: ['arrays'] }, { signal: signal() });
    expect(runs).toBe(4); expect(none.stats().disabled).toBe(true);
  });
  it('never caches a failed or unverified receipt', async () => {
    let runs = 0;
    const cache = withReceiptCache(async ({ task }) => { runs++; return { kind: 'ok', value: { ...pass(task.task_id), semantic_verified: false, valid: false } }; }, async () => 'identity');
    await cache({ task: task(), claimed_topics: ['arrays'] }, { signal: signal() }); await cache({ task: task(), claimed_topics: ['arrays'] }, { signal: signal() });
    expect(runs).toBe(2);
  });
});

const dockerReady = spawnSync('docker', ['image', 'inspect', 'torquecode-runner-python:dev'], { stdio: 'ignore', timeout: 10_000 }).status === 0;
describe.skipIf(!dockerReady)('end to end through K5 on the real runner', () => {
  it('evidence-selected tasks for three portfolios are all independently certified and differ', async () => {
    const validateTask = withReceiptCache(createValidationEngine(createDockerRunner()));
    const down: Ports['chat'] = async () => ({ kind: 'unavailable', code: 'LLM_UNAVAILABLE', message: 'down' });
    const generate = createGenerator({ chat: down, runTests: createDockerRunner(), validateTask, seedBank: () => loadSeedBank(), log: () => {} });
    const results: string[] = [];
    for (const name of ['ecommerce_backend', 'security_student', 'ml_engineer']) {
      const { profile, evidence } = load(name);
      const result = await generate({ profile, focus_lane: { domain: profile.domain, skills: profile.skills, topics: profile.claimed_topics }, evidence, progress: () => {} }, { signal: AbortSignal.timeout(300_000) });
      expect(result.kind, name).toBe('ok');
      if (result.kind !== 'ok') return;
      for (const t of tiers) expect(result.value[t].dsa_topics.every(topic => profile.claimed_topics.includes(topic))).toBe(true);
      results.push(tiers.map(t => `${result.value[t].family_id}:${result.value[t].selection?.scenario_id}`).join('|'));
    }
    expect(new Set(results).size).toBe(3);
  }, 600_000);
});
