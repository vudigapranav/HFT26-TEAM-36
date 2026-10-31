// Doing nothing must read 0 tests and score 0, for every domain and whatever the quiz answers were
// (the quiz only picks the focus; scoring never reads domain or answers).
import { describe, expect, it } from 'vitest';
import type { Event, InternalRunResult, PrivateTask, Session } from '../../contracts/internal.js';
import { buildReportValue } from '../../scoring/report.js';

const T0 = Date.parse('2026-10-31T00:00:00Z');
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const DOMAINS = ['web', 'ml', 'security', 'backend'] as const;

// Each task: 4 tests pass on the untouched starter (P2P), 6 must be fixed (F2P).
const mkTask = (id: string, tier: PrivateTask['tier'], domain: PrivateTask['domain']): PrivateTask => ({
  task_id: id, tier, domain, language: 'python', task_type: 'bug_fix', title: id, statement_md: 'S',
  dsa_topics: ['arrays'], source: 'generated', visible_tests: [],
  files: [{ path: 'app/a.py', content: 'starter', editable: true }], reference_files: [],
  tests: [{ path: 'tests/t.py', content: '', visibility: 'visible', ids: ['p1', 'p2', 'f1', 'f2'] },
    { path: 'tests/h.py', content: '', visibility: 'hidden', ids: ['p3', 'p4', 'f3', 'f4', 'f5', 'f6'] }],
  hint_ladder: ['1', '2', '3'], limits: { wall_time_ms: 1, memory_mb: 1, cpu_count: 1, pids: 1, output_bytes: 1 },
  f2p_ids: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'], p2p_ids: ['p1', 'p2', 'p3', 'p4'],
});

function report(domain: PrivateTask['domain'], submitted: Record<string, number | undefined>) {
  const tasks = [mkTask('q1', 'novice', domain), mkTask('q2', 'adept', domain), mkTask('q3', 'master', domain)];
  const session: Session = { id: 's', user_id: 'u', started_at: at(0), expires_at: at(3600), current_tier: 'master', status: 'finished' };
  const runs: InternalRunResult[] = [];
  const events: Event[] = [
    { session_id: 's', task_id: 'q2', ts: at(1), source: 'server', type: 'tier_unlocked', payload: { to: 'adept' } },
    { session_id: 's', task_id: 'q3', ts: at(2), source: 'server', type: 'tier_unlocked', payload: { to: 'master' } },
  ];
  let n = 0;
  for (const [task_id, passed] of Object.entries(submitted)) {
    if (passed === undefined) continue;
    const run_id = `r${++n}`;
    runs.push({ run_id, task_id, mode: 'submit', passed, total: 10, stdout: '', stderr: '', timed_out: false, tests: [] });
    events.push({ session_id: 's', task_id, ts: at(10 + n), source: 'server', type: 'submit', payload: { run_id, files_hash: 'x' } });
  }
  return buildReportValue({ session, tasks, runs, events });
}
const tested = (r: ReturnType<typeof report>) => r.tasks.reduce((s, t) => s + t.passed, 0);

describe.each(DOMAINS)('domain %s', domain => {
  it('nothing submitted: 0 tests and score 0', () => {
    const r = report(domain, {});
    expect(tested(r)).toBe(0);
    expect(r.final_score).toBe(0);
  });
  it('unchanged starter submitted everywhere (only the P2P tests pass): 0 tests and score 0', () => {
    const r = report(domain, { q1: 4, q2: 4, q3: 4 });
    expect(tested(r)).toBe(0);
    expect(r.final_score).toBe(0);
  });
  it('every bug fixed: all fixable tests and full correctness', () => {
    const r = report(domain, { q1: 10, q2: 10, q3: 10 });
    expect(r.tasks.map(t => `${t.passed}/${t.total}`)).toEqual(['6/6', '6/6', '6/6']);
    expect(r.final_score).toBeGreaterThanOrEqual(80);
  });
  it('partial work scores between, in proportion to bugs fixed', () => {
    const r = report(domain, { q1: 7, q2: undefined, q3: 4 });
    expect(r.tasks.map(t => t.passed)).toEqual([3, 0, 0]);
    expect(r.final_score).toBeGreaterThan(0);
    expect(r.final_score).toBeLessThan(40);
  });
});
