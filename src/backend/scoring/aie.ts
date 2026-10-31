// P4 — calculateAie seam (owner: Pranav). Context §12 + "Decided by Pranav" rules 1–5. Deterministic, logs only.
// TODO(OPEN-Q4): which tiers count toward the final score is decided by the report, not here.
//
// Event payload convention this scorer needs (API must log these):
//   run / submit:  { run_id: string, files_hash: string }  — files_hash = hashEditableFiles(files)
//   hint_served:   { level: 1 | 2 | 3 }
//   assistant_message / assistant_blocked: no payload needed
import { createHash } from 'node:crypto';
import type { AieScore, File } from '@torquecode/contracts';
import type { Event, InternalRunResult, PrivateTask, SeamResult } from '../contracts/internal.js';

/**
 * Pass rate credited beyond the starter baseline. P2P tests pass on the untouched starter by design
 * (K5 guarantees it), so they prove nothing on their own: submitting the starter unchanged scores 0.
 * Falls back to the raw rate when the run doesn't match the task's F2P/P2P manifest.
 */
/** Tests credited beyond the starter baseline, out of the tests that need fixing (F2P). Same rule as creditedPassRate. */
export function creditedCounts(passed: number, total: number, task: Pick<PrivateTask, 'f2p_ids' | 'p2p_ids'>): { passed: number; total: number } {
  const baseline = task.p2p_ids?.length ?? 0, fixable = task.f2p_ids?.length ?? 0;
  if (!fixable || baseline + fixable !== total) return { passed, total };
  return { passed: Math.max(0, Math.min(fixable, passed - baseline)), total: fixable };
}

export function creditedPassRate(passed: number, total: number, task: Pick<PrivateTask, 'f2p_ids' | 'p2p_ids'>): number {
  if (total <= 0) return 0;
  const baseline = task.p2p_ids?.length ?? 0, fixable = task.f2p_ids?.length ?? 0;
  if (!fixable || baseline + fixable !== total) return passed / total;
  return Math.max(0, Math.min(1, (passed - baseline) / fixable));
}

export const AIE_H_MAX = 6;
export const AIE_MAX = 20;
export const HINT_WEIGHT = { 1: 1, 2: 2, 3: 3 } as const;
export const ASSISTANT_WEIGHT = 1;
export const YIELD_WINDOW_RUNS = 3;
export const YIELD_WINDOW_MS = 10 * 60 * 1000;

// Rule 4: sha256 of editable files, sorted by path, line endings normalized to LF.
export function hashEditableFiles(files: File[]): string {
  const h = createHash('sha256');
  for (const f of files.filter(x => x.editable).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    h.update(f.path).update('\0').update(f.content.replace(/\r\n?/g, '\n')).update('\0');
  }
  return h.digest('hex');
}

const clip01 = (x: number) => Math.max(0, Math.min(1, x));
const r2 = (x: number) => Math.round(x * 100) / 100;
const visibleRate = (r: InternalRunResult) => {
  const v = r.tests.filter(t => t.visibility === 'visible');
  return v.length ? v.filter(t => t.status === 'pass').length / v.length : 0;
};

export type AieDetail = AieScore & { weighted_ai: number; ai_interactions: number; runs: number; runs_after_change: number; integrity_flags: number };

export function computeAie(events: Event[], runs: InternalRunResult[], task: PrivateTask): AieDetail {
  const ev = events.filter(e => e.task_id === task.task_id).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const byId = new Map(runs.map(r => [r.run_id, r]));
  const ts = (e: Event) => Date.parse(e.ts);
  const runEvents = ev.filter(e => e.type === 'run').map(e => ({ e, r: byId.get(String(e.payload.run_id)), hash: String(e.payload.files_hash ?? '') }))
    .filter((x): x is { e: Event; r: InternalRunResult; hash: string } => x.r !== undefined && x.r.mode === 'run');
  const submits = ev.filter(e => e.type === 'submit').map(e => ({ e, r: byId.get(String(e.payload.run_id)) }))
    .filter((x): x is { e: Event; r: InternalRunResult } => x.r !== undefined);
  const ai = ev.filter(e => e.type === 'hint_served' || e.type === 'assistant_message');

  // Rules 1 + 5: weighted AI use; blocked attempts weigh 0 but are counted as integrity flags.
  const weighted_ai = ai.reduce((s, e) => {
    if (e.type === 'assistant_message') return s + ASSISTANT_WEIGHT;
    const lvl = Number(e.payload.level);
    return s + (lvl === 1 || lvl === 2 || lvl === 3 ? HINT_WEIGHT[lvl] : HINT_WEIGHT[3]);
  }, 0);
  const independence = 1 - Math.min(1, weighted_ai / AIE_H_MAX);
  const integrity_flags = ev.filter(e => e.type === 'assistant_blocked').length;

  // Rule 2: HintYield — window = first of 3 runs or 10 minutes; baseline = last run before the interaction.
  let hint_yield = 1;
  if (ai.length) {
    const ys = ai.map(h => {
      const before = runEvents.filter(x => ts(x.e) < ts(h));
      const last = before[before.length - 1];
      const baseline = last ? visibleRate(last.r) : 0;
      const win = runEvents.filter(x => ts(x.e) >= ts(h) && ts(x.e) - ts(h) <= YIELD_WINDOW_MS).slice(0, YIELD_WINDOW_RUNS);
      return win.length ? clip01(Math.max(...win.map(x => visibleRate(x.r))) - baseline) : 0;
    });
    hint_yield = ys.reduce((a, b) => a + b, 0) / ys.length;
  }

  // Rules 3 + 4: TestDiscipline; submits are not runs; first run compares with the starter hash.
  let prev = hashEditableFiles(task.files);
  let runs_after_change = 0;
  for (const x of runEvents) { if (x.hash && x.hash !== prev) runs_after_change++; prev = x.hash || prev; }
  const firstSubmit = submits[0] ? ts(submits[0].e) : undefined;
  const ranBeforeSubmit = firstSubmit === undefined || runEvents.some(x => ts(x.e) < firstSubmit);
  const test_discipline = runEvents.length === 0 || !ranBeforeSubmit ? 0 : runs_after_change / runEvents.length;

  // Rule 5: gate from the final submit, credited beyond the starter baseline (unchanged starter -> 0).
  const final = submits[submits.length - 1]?.r;
  const finalPass = final ? creditedPassRate(final.passed, final.total, task) : 0;
  const gate = Math.min(1, finalPass / 0.5);

  const score = AIE_MAX * gate * (0.5 * independence + 0.3 * hint_yield + 0.2 * test_discipline);
  return { score: r2(score), max: AIE_MAX, independence: r2(independence), hint_yield: r2(hint_yield),
    test_discipline: r2(test_discipline), gate: r2(gate), weighted_ai, ai_interactions: ai.length,
    runs: runEvents.length, runs_after_change, integrity_flags };
}

// Seam signature from contracts/seams.ts (Ports.calculateAie).
export function calculateAie(input: { events: Event[]; runs: InternalRunResult[]; task: PrivateTask }): SeamResult<AieScore> {
  const d = computeAie(input.events, input.runs, input.task);
  const { score, max, independence, hint_yield, test_discipline, gate } = d;
  return { kind: 'ok', value: { score, max, independence, hint_yield, test_discipline, gate } };
}
