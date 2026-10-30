import { describe, expect, it } from 'vitest';
import type { Event, InternalRunResult, PrivateTask } from '../../contracts/internal.js';
import { calculateAie, computeAie, hashEditableFiles } from '../../scoring/aie.js';

const task: PrivateTask = {
  task_id: 't1', tier: 'adept', domain: 'backend', language: 'python', task_type: 'bug_fix', title: 'T',
  statement_md: 'S', dsa_topics: ['arrays'], source: 'seed_bank', visible_tests: [],
  files: [{ path: 'app/a.py', content: 'starter\r\n', editable: true }, { path: 'app/b.py', content: 'fixed', editable: false }],
  reference_files: [], tests: [], hint_ladder: ['h1', 'h2', 'h3'],
  limits: { wall_time_ms: 1, memory_mb: 1, cpu_count: 1, pids: 1, output_bytes: 1 }, f2p_ids: [], p2p_ids: [],
};
const STARTER = hashEditableFiles(task.files);
const T0 = Date.parse('2026-10-31T00:00:00Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();
const MIN = 60_000;

let n = 0;
const runs: InternalRunResult[] = [];
const ev = (type: Event['type'], ms: number, payload: Record<string, unknown> = {}): Event =>
  ({ session_id: 's', task_id: 't1', ts: at(ms), source: 'server', type, payload });
const run = (ms: number, hash: string, passed: number, of = 3): Event => {
  const run_id = `r${++n}`;
  runs.push({ run_id, task_id: 't1', mode: 'run', passed, total: of, stdout: '', stderr: '', timed_out: false,
    tests: Array.from({ length: of }, (_, i) => ({ id: `v${i}`, visibility: 'visible' as const, duration_ms: 1, status: i < passed ? 'pass' as const : 'fail' as const })) });
  return ev('run', ms, { run_id, files_hash: hash });
};
const submit = (ms: number, passed: number, of = 7): Event => {
  const run_id = `r${++n}`;
  runs.push({ run_id, task_id: 't1', mode: 'submit', passed, total: of, stdout: '', stderr: '', timed_out: false, tests: [] });
  return ev('submit', ms, { run_id, files_hash: 'x' });
};
const hint = (ms: number, level: 1 | 2 | 3) => ev('hint_served', ms, { level });
const aie = (events: Event[]) => computeAie(events, runs, task);

describe('calculateAie (context §12 + Decided by Pranav)', () => {
  it('hash is LF-normalized and ignores non-editable files', () => {
    expect(hashEditableFiles([{ path: 'app/a.py', content: 'starter\n', editable: true }])).toBe(STARTER);
  });
  it('no AI + solved → 20', () => {
    expect(aie([run(1, 'a', 1), run(2, 'b', 3), submit(3, 7)]).score).toBe(20);
  });
  it('no AI + failed → not 20 (gate)', () => {
    const d = aie([run(1, 'a', 0), submit(2, 1)]);
    expect(d.score).toBeLessThan(20);
    expect(d.gate).toBeLessThan(1);
  });
  it('untouched starter run and unchanged reruns do not count', () => {
    const d = aie([run(1, STARTER, 0), run(2, 'a', 1), run(3, 'a', 1), run(4, 'b', 3), submit(5, 7)]);
    expect(d.runs_after_change).toBe(2);
    expect(d.test_discipline).toBe(0.5);
  });
  it('no run before first submit → TestDiscipline 0 only', () => {
    const d = aie([submit(1, 7), run(2, 'a', 3)]);
    expect(d.test_discipline).toBe(0);
    expect(d.score).toBe(16);
  });
  it('more hints with no progress → lower score', () => {
    const helpful = aie([run(1, 'a', 0), hint(2, 1), run(3, 'b', 3), submit(4, 7)]);
    const useless = aie([run(1, 'a', 0), hint(2, 1), hint(3, 2), hint(4, 3), run(5, 'b', 0), run(6, 'c', 0), submit(7, 7)]);
    expect(useless.independence).toBe(0);
    expect(useless.hint_yield).toBe(0);
    expect(useless.score).toBeLessThan(helpful.score);
  });
  it('yield window = first of 3 runs or 10 minutes', () => {
    expect(aie([run(0, 'a', 1), hint(1, 1), run(2 + 11 * MIN, 'b', 3), submit(3 + 11 * MIN, 7)]).hint_yield).toBe(0);
    expect(aie([run(0, 'a', 1), hint(1, 1), run(2, 'b', 1), run(3, 'c', 1), run(4, 'd', 1), run(5, 'e', 3), submit(6, 7)]).hint_yield).toBe(0);
  });
  it('assistant messages count; blocked attempts weigh 0 but are flagged', () => {
    const d = aie([run(1, 'a', 0), ev('assistant_message', 2), ev('assistant_blocked', 3), run(4, 'b', 3), submit(5, 7)]);
    expect(d.weighted_ai).toBe(1);
    expect(d.integrity_flags).toBe(1);
  });
  it('no submit → gate 0 → score 0; seam returns contract shape', () => {
    expect(aie([run(1, 'a', 3)]).score).toBe(0);
    const r = calculateAie({ events: [run(1, 'a', 1), submit(2, 7)], runs, task });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(Object.keys(r.value).sort()).toEqual(['gate', 'hint_yield', 'independence', 'max', 'score', 'test_discipline']);
  });
});
