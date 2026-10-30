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
