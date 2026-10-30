// P5 — buildReport seam (owner: Pranav). Deterministic: built only from session, tasks, runs and events.
//
// Final score policy (named constants so the team can change it in one place):
//   final_score = CORRECTNESS_WEIGHT × correctness + AIE contribution (max 20, per the problem statement)
//   correctness = mean final-submit pass rate (all tests) over the tasks in the session; no submit → 0
//   AIE contribution = mean calculateAie score over attempted tasks in AI_TIERS
// TODO(OPEN-Q4): Novice has no assistant. Until the team decides, a session with no attempted Adept/Master task
// scales correctness to the full 100 (AIE_FALLBACK = 'scale_correctness').
import type { AieScore, Report, Tier } from '@torquecode/contracts';
import type { Event, InternalRunResult, PrivateTask, SeamResult, Session } from '../contracts/internal.js';
import { computeAie } from './aie.js';

export const CORRECTNESS_WEIGHT = 80;
export const AI_TIERS: Tier[] = ['adept', 'master'];
export const AIE_FALLBACK = 'scale_correctness' as const; // TODO(OPEN-Q4)
const INTEGRITY_TYPES = ['tab_hidden', 'copy', 'paste', 'assistant_blocked', 'extraction_flagged'] as const;
const TIER_ORDER: Tier[] = ['novice', 'adept', 'master'];
const r2 = (x: number) => Math.round(x * 100) / 100;
const ms = (iso: string) => Date.parse(iso);

export function buildReportValue(input: { session: Session; tasks: PrivateTask[]; runs: InternalRunResult[]; events: Event[] }): Report {
  const { session, tasks, runs, events } = input;
  const byId = new Map(runs.map(r => [r.run_id, r]));
  const sessionEnd = ms(session.expires_at);

  const rows = tasks.map(task => {
    const ev = events.filter(e => e.task_id === task.task_id).sort((a, b) => ms(a.ts) - ms(b.ts));
    const submits = ev.filter(e => e.type === 'submit')
      .map(e => byId.get(String(e.payload.run_id)))
      .filter((r): r is InternalRunResult => r !== undefined && r.mode === 'submit');
    const final = submits[submits.length - 1];
    const attempted = ev.some(e => e.type === 'run' || e.type === 'submit');
    const start = ev[0] ? ms(ev[0].ts) : undefined;
    const lastSubmitEv = [...ev].reverse().find(e => e.type === 'submit');
    const end = lastSubmitEv ? ms(lastSubmitEv.ts) : Math.min(sessionEnd, ev.length ? ms(ev[ev.length - 1]?.ts ?? session.started_at) : sessionEnd);
    const aie: AieScore | null = AI_TIERS.includes(task.tier) && attempted
      ? (({ score, max, independence, hint_yield, test_discipline, gate }) => ({ score, max, independence, hint_yield, test_discipline, gate }))(computeAie(events, runs, task))
      : null;
    return {
      task, attempted, final, aie,
      row: {
        task_id: task.task_id,
        passed: final?.passed ?? 0,
        total: final?.total ?? task.tests.reduce((s, t) => s + t.ids.length, 0),
        time_sec: start === undefined ? 0 : r2(Math.max(0, end - start) / 1000),
        hints_used: ev.filter(e => e.type === 'hint_served').length,
        aie,
      },
    };
  });

  const passRate = (x: (typeof rows)[number]) => (x.final && x.final.total > 0 ? x.final.passed / x.final.total : 0);
  const correctness = rows.length ? rows.reduce((s, x) => s + passRate(x), 0) / rows.length : 0;
  const aieRows = rows.filter(x => x.aie !== null);
  const aiePart = aieRows.length ? aieRows.reduce((s, x) => s + (x.aie?.score ?? 0), 0) / aieRows.length : null;
  const final_score = aiePart === null ? r2(100 * correctness) : r2(CORRECTNESS_WEIGHT * correctness + aiePart);

  // Outcome: highest tier whose task was fully solved on its final submit.
  const solvedTiers = rows.filter(x => x.final && x.final.total > 0 && x.final.passed === x.final.total).map(x => x.task.tier);
  const highest = [...TIER_ORDER].reverse().find(t => solvedTiers.includes(t));
  const solved = solvedTiers.length;
  const outcome = highest
    ? `Solved ${solved} of ${rows.length} task(s); highest tier fully solved: ${highest}.`
    : `Solved 0 of ${rows.length} task(s); no tier fully solved yet.`;

  // Focus areas: topics of tasks not fully solved, then behaviour signals from the AI score.
  const focus = new Set<string>();
  for (const x of rows) if (!(x.final && x.final.total > 0 && x.final.passed === x.final.total)) for (const t of x.task.dsa_topics) focus.add(`Practice ${t.replace(/_/g, ' ')} (${x.task.tier} task not fully solved)`);
  for (const x of aieRows) {
    if ((x.aie?.test_discipline ?? 1) < 0.5) focus.add('Run tests after each real code change before submitting');
    if ((x.aie?.independence ?? 1) < 0.5) focus.add('Try more before asking the assistant for hints');
  }

  const integrity_signals = INTEGRITY_TYPES
    .map(type => ({ type, count: events.filter(e => e.type === type).length }))
    .filter(s => s.count > 0);

  return {
    report_id: `report-${session.id}`.slice(0, 80),
    session_id: session.id,
    tasks: rows.map(x => x.row),
    final_score: Math.max(0, Math.min(100, final_score)),
    outcome,
    focus_areas: [...focus].slice(0, 50),
    integrity_signals,
  };
}

// Seam signature from contracts/seams.ts (Ports.buildReport).
export function buildReport(input: { session: Session; tasks: PrivateTask[]; runs: InternalRunResult[]; events: Event[] }): SeamResult<Report> {
  return { kind: 'ok', value: buildReportValue(input) };
}
