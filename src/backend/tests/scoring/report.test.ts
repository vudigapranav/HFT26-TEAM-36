import { describe, expect, it } from 'vitest';
import { Report } from '@torquecode/contracts';
import Value from 'typebox/value';
import type { Event, InternalRunResult, PrivateTask, Session } from '../../contracts/internal.js';
import { buildReport, buildReportValue } from '../../scoring/report.js';

const T0 = Date.parse('2026-10-31T00:00:00Z');
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const session: Session = { id: 'sess1', user_id: 'u1', started_at: at(0), expires_at: at(3600), current_tier: 'adept', status: 'finished' };
const mkTask = (id: string, tier: PrivateTask['tier'], topics: PrivateTask['dsa_topics']): PrivateTask => ({
  task_id: id, tier, domain: 'backend', language: 'python', task_type: 'bug_fix', title: id, statement_md: 'S',
  dsa_topics: topics, source: 'seed_bank', visible_tests: [],
  files: [{ path: 'app/a.py', content: 'starter', editable: true }], reference_files: [],
  tests: [{ path: 'tests/t.py', content: '', visibility: 'visible', ids: ['a', 'b', 'c'] }, { path: 'tests/h.py', content: '', visibility: 'hidden', ids: ['d', 'e'] }],
  hint_ladder: ['1', '2', '3'], limits: { wall_time_ms: 1, memory_mb: 1, cpu_count: 1, pids: 1, output_bytes: 1 }, f2p_ids: [], p2p_ids: [],
});
const novice = mkTask('nov', 'novice', ['arrays']);
const adept = mkTask('ade', 'adept', ['hashing', 'two_pointers']);

let n = 0;
const runs: InternalRunResult[] = [];
const ev = (task_id: string, type: Event['type'], sec: number, payload: Record<string, unknown> = {}): Event =>
  ({ session_id: 'sess1', task_id, ts: at(sec), source: 'server', type, payload });
const run = (task_id: string, sec: number, hash: string, passed: number): Event => {
  const run_id = `r${++n}`;
  runs.push({ run_id, task_id, mode: 'run', passed, total: 3, stdout: '', stderr: '', timed_out: false,
    tests: Array.from({ length: 3 }, (_, i) => ({ id: `v${i}`, visibility: 'visible' as const, duration_ms: 1, status: i < passed ? 'pass' as const : 'fail' as const })) });
  return ev(task_id, 'run', sec, { run_id, files_hash: hash });
};
const submit = (task_id: string, sec: number, passed: number): Event => {
  const run_id = `r${++n}`;
  runs.push({ run_id, task_id, mode: 'submit', passed, total: 5, stdout: '', stderr: '', timed_out: false, tests: [] });
  return ev(task_id, 'submit', sec, { run_id, files_hash: 'x' });
};

describe('buildReport (P5)', () => {
  it('perfect novice + perfect adept without AI → 100, contract-valid', () => {
    const events = [run('nov', 10, 'a', 3), submit('nov', 100, 5), run('ade', 200, 'b', 3), submit('ade', 500, 5)];
    const r = buildReport({ session, tasks: [novice, adept], runs, events });
    if (r.kind !== 'ok') throw new Error('expected ok');
    expect(Value.Check(Report, r.value)).toBe(true);
    expect(r.value.final_score).toBe(100);
    expect(r.value.tasks[0]).toMatchObject({ task_id: 'nov', passed: 5, total: 5, time_sec: 90, hints_used: 0, aie: null });
    expect(r.value.tasks[1]?.aie?.score).toBe(20);
    expect(r.value.outcome).toContain('highest tier fully solved: adept');
    expect(r.value.focus_areas).toEqual([]);
  });

  it('partial work → lower score, focus on unsolved topics, integrity counted', () => {
    const events = [run('nov', 10, 'a', 3), submit('nov', 100, 5),
      run('ade', 200, 'b', 0), ev('ade', 'hint_served', 210, { level: 3 }), ev('ade', 'hint_served', 220, { level: 3 }),
      ev('ade', 'tab_hidden', 230), ev('ade', 'paste', 240, { size: 500 }), submit('ade', 300, 2)];
    const r = buildReportValue({ session, tasks: [novice, adept], runs, events });
    expect(Value.Check(Report, r)).toBe(true);
    expect(r.final_score).toBeLessThan(100);
    expect(r.tasks[1]).toMatchObject({ passed: 2, total: 5, hints_used: 2 });
    expect(r.focus_areas.join(' ')).toContain('hashing');
    expect(r.focus_areas.join(' ')).toContain('Try more before asking');
    expect(r.integrity_signals).toEqual([{ type: 'tab_hidden', count: 1 }, { type: 'paste', count: 1 }]);
    expect(r.outcome).toContain('highest tier fully solved: novice');
  });

  it('novice-only session (no AI tier attempted) scales correctness to 100 — TODO(OPEN-Q4)', () => {
    const events = [run('nov', 10, 'a', 3), submit('nov', 100, 4)];
    const r = buildReportValue({ session, tasks: [novice], runs, events });
    expect(r.final_score).toBe(80);
    expect(r.tasks[0]?.aie).toBeNull();
  });

  it('nothing attempted → 0 and a clear outcome', () => {
    const r = buildReportValue({ session, tasks: [novice, adept], runs, events: [] });
    expect(r.final_score).toBe(0);
    expect(r.outcome).toContain('no tier fully solved');
    expect(r.tasks[0]).toMatchObject({ passed: 0, total: 5, time_sec: 0 });
    expect(Value.Check(Report, r)).toBe(true);
  });
});

describe('buildReport — hardening (found by fuzzing)', () => {
  it('does not call a multi-question tier solved when another question is untouched', () => {
    const other = mkTask('ade2', 'adept', ['hashing']);
    const events = [submit('nov', 100, 5), submit('ade', 200, 5)];
    const r = buildReportValue({ session, tasks: [novice, adept, other], runs, events });
    expect(r.outcome).toContain('Solved 2 of 3 task(s)');
    expect(r.outcome).toContain('highest tier fully solved: novice');
  });

  it('requires every question to pass its latest submit before a tier is fully solved', () => {
    const other = mkTask('ade2', 'adept', ['hashing']);
    const events = [submit('ade', 100, 5), submit('ade2', 200, 5), submit('ade2', 300, 4)];
    const input = { session, tasks: [adept, other], runs, events };
    expect(buildReportValue(input).outcome).toContain('Solved 1 of 2 task(s); no tier fully solved yet.');
    events.push(submit('ade2', 400, 5));
    expect(buildReportValue(input).outcome).toContain('Solved 2 of 2 task(s); highest tier fully solved: adept');
  });

  it('caps task rows at the contract limit and survives a task without dsa_topics', () => {
    const many = Array.from({ length: 25 }, (_, i) => mkTask(`t${i}`, 'novice', ['arrays']));
    const noTopics = { ...mkTask('nt', 'novice', ['arrays']), dsa_topics: undefined } as unknown as PrivateTask;
    const r = buildReportValue({ session, tasks: [...many, noTopics], runs, events: [] });
    expect(r.tasks.length).toBe(20);
    expect(Value.Check(Report, r)).toBe(true);
  });
});

// P11 — question-set unlock rule (context §5): only tasks of tiers the candidate reached count.
describe('buildReport — only available question sets count (P11)', () => {
  const master = mkTask('mas', 'master', ['sliding_window']);
  const all = [novice, adept, master];
  const at = (current_tier: Session['current_tier']): Session => ({ ...session, current_tier });

  it('current_tier novice → only the novice row; adept/master tasks do not change the score', () => {
    const events = [run('nov', 10, 'a', 3), submit('nov', 100, 4)];
    const r = buildReportValue({ session: at('novice'), tasks: all, runs, events });
    expect(Value.Check(Report, r)).toBe(true);
    expect(r.tasks.map(t => t.task_id)).toEqual(['nov']);
    expect(r.final_score).toBe(80); // novice-only: 4/5 scaled to 100 (Q4)
    expect(r.final_score).toBe(buildReportValue({ session: at('novice'), tasks: [novice], runs, events }).final_score);
    expect(r.focus_areas.join(' ')).not.toMatch(/hashing|two pointers|sliding window/);
    expect(r.outcome).toContain('Solved 0 of 1 task(s)');
    expect(r.outcome).toContain('Unlocked 0 of 2 further question sets.');
  });

  it('current_tier adept → novice + adept rows; master excluded', () => {
    const events = [run('nov', 10, 'a', 3), submit('nov', 100, 5), run('ade', 200, 'b', 3), submit('ade', 300, 5)];
    const r = buildReportValue({ session: at('adept'), tasks: all, runs, events });
    expect(Value.Check(Report, r)).toBe(true);
    expect(r.tasks.map(t => t.task_id)).toEqual(['nov', 'ade']);
    expect(r.final_score).toBe(100);
    expect(r.focus_areas.join(' ')).not.toContain('sliding window');
    expect(r.outcome).toContain('Solved 2 of 2 task(s)');
    expect(r.outcome).toContain('Unlocked 1 of 2 further question sets.');
  });

  it('tier_unlocked / tier_upgraded events are honoured even if current_tier lags', () => {
    const events = [submit('nov', 100, 5), ev('nov', 'tier_unlocked', 110, { tier: 'adept' }), ev('ade', 'tier_upgraded', 120, { tier: 'master' })];
    const r = buildReportValue({ session: at('novice'), tasks: all, runs, events });
    expect(Value.Check(Report, r)).toBe(true);
    expect(r.tasks.map(t => t.task_id)).toEqual(['nov', 'ade', 'mas']);
    expect(r.outcome).toContain('Unlocked 2 of 2 further question sets.');
  });

  it('malformed tier events are ignored', () => {
    const events = [submit('nov', 100, 5), ev('nov', 'tier_unlocked', 110, { tier: 'grandmaster' }), ev('nov', 'tier_upgraded', 120, {})];
    const r = buildReportValue({ session: at('novice'), tasks: all, runs, events });
    expect(r.tasks.map(t => t.task_id)).toEqual(['nov']);
  });

  it('available but unattempted adept task still counts toward correctness (it was offered)', () => {
    const events = [run('nov', 10, 'a', 3), submit('nov', 100, 5)];
    const r = buildReportValue({ session: at('adept'), tasks: all, runs, events });
    expect(r.tasks.map(t => t.task_id)).toEqual(['nov', 'ade']);
    expect(r.final_score).toBe(50); // no attempted AI-tier task → scaled: mean(1, 0) × 100
    expect(Value.Check(Report, r)).toBe(true);
  });
});


describe('buildReport — K10 unlock event payload', () => {
  it('tier_upgraded { unlocks_used } counts as reaching that tier rank', async () => {
    const { highestTierRank } = await import('../../scoring/report.js');
    const ev = (type: Event['type'], payload: Record<string, unknown>) => ({ type, payload });
    expect(highestTierRank({ current_tier: 'novice' }, [ev('tier_upgraded', { unlocks_used: 1 })])).toBe(1);
    expect(highestTierRank({ current_tier: 'novice' }, [ev('tier_upgraded', { unlocks_used: 2 })])).toBe(2);
    expect(highestTierRank({ current_tier: 'novice' }, [ev('tier_upgraded', { unlocks_used: 9 })])).toBe(2);
    expect(highestTierRank({ current_tier: 'novice' }, [ev('tier_upgraded', { unlocks_used: 'x' })])).toBe(0);
    expect(highestTierRank({ current_tier: 'adept' }, [ev('tier_unlocked', { tier: 'master' })])).toBe(2);
  });
});

describe('buildReport — claims integration (P13)', () => {
  const profile = { domain: 'backend' as const, domain_confidence: 1,
    claimed_topics: ['arrays', 'hashing', 'graphs'] as const, tech_stack: ['python'], skills: [] };
  const claimProfile = { ...profile, claimed_topics: [...profile.claimed_topics] };
  it('returns contract-valid demonstrated, failed, and untested claims from final submissions', () => {
    const events = [submit('nov', 100, 5), submit('ade', 200, 2)];
    const report = buildReportValue({ session, profile: claimProfile, tasks: [novice, adept], runs, events });
    expect(Value.Check(Report, report)).toBe(true);
    expect(report.claims).toEqual([
      { topic: 'arrays', tested_by: 'nov', demonstrated: true },
      { topic: 'hashing', tested_by: 'ade', demonstrated: false },
      { topic: 'graphs', tested_by: null, demonstrated: null },
    ]);
  });
  it('does not claim an offered or locked task was tested without an attempt', () => {
    const report = buildReportValue({ session: { ...session, current_tier: 'novice' },
      profile: claimProfile, tasks: [novice, adept], runs, events: [] });
    expect(report.claims).toEqual(claimProfile.claimed_topics.map(topic => ({ topic, tested_by: null, demonstrated: null })));
    expect(Value.Check(Report, report)).toBe(true);
  });
  it('remains backwards-compatible when callers have no profile', () => {
    expect(buildReportValue({ session, tasks: [novice], runs: [], events: [] })).not.toHaveProperty('claims');
  });
});
