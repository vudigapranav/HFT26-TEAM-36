// P5 — buildReport seam (owner: Pranav). Deterministic: built only from session, tasks, runs and events.
//
// Final score policy (named constants so the team can change it in one place):
//   final_score = CORRECTNESS_WEIGHT × correctness + AIE contribution (max 20, per the problem statement)
//   correctness = mean final-submit pass rate (all tests) over the AVAILABLE tasks; no submit → 0
//   AIE contribution = mean calculateAie score over attempted available tasks in AI_TIERS
// Q4 [LOCKED]: Novice has no assistant, so a session with no attempted Adept/Master task scales correctness to the
// full 100 (AIE_FALLBACK = 'scale_correctness').
//
// Question-set unlock rule (context §5, P11): a task is available only if its tier was reached, i.e. tier rank ≤ the
// highest of session.current_tier and any tier named in tier_unlocked / tier_upgraded events ({ tier } or K10's { unlocks_used }). Tasks of
// locked tiers get no row and don't affect correctness, focus areas or outcome.
import type { AieScore, Report, Tier } from '@torquecode/contracts';
import type { Event, InternalRunResult, PrivateTask, SeamResult, Session } from '../contracts/internal.js';
import { computeAie } from './aie.js';

export const CORRECTNESS_WEIGHT = 80;
export const AI_TIERS: Tier[] = ['adept', 'master'];
export const AIE_FALLBACK = 'scale_correctness' as const; // Q4 [LOCKED]
export const MAX_UNLOCKS = 2;
const INTEGRITY_TYPES = ['tab_hidden', 'copy', 'paste', 'assistant_blocked', 'extraction_flagged'] as const;
const TIER_ORDER: Tier[] = ['novice', 'adept', 'master'];
const MAX_REPORT_TASKS = 20; // Report contract limit
const r2 = (x: number) => Math.round(x * 100) / 100;
const ms = (iso: string) => Date.parse(iso);
const isTier = (x: unknown): x is Tier => typeof x === 'string' && (TIER_ORDER as string[]).includes(x);

// Highest tier rank the candidate reached: current_tier, or a tier named by an unlock/upgrade event.
export function highestTierRank(session: Pick<Session, 'current_tier'>, events: Pick<Event, 'type' | 'payload'>[]): number {
  const fromEvents = events
    .filter(e => e.type === 'tier_unlocked' || e.type === 'tier_upgraded')
    .map(e => isTier(e.payload.tier) ? TIER_ORDER.indexOf(e.payload.tier)
      // K10 logs { unlocks_used: 1|2 }: n unlocks means tier rank n was reached.
      : typeof e.payload.unlocks_used === 'number' && Number.isInteger(e.payload.unlocks_used) ? Math.min(Math.max(e.payload.unlocks_used, 0), MAX_UNLOCKS) : -1);
  return Math.max(TIER_ORDER.indexOf(session.current_tier), ...fromEvents);
}

export function buildReportValue(input: { session: Session; tasks: PrivateTask[]; runs: InternalRunResult[]; events: Event[] }): Report {
  const { session, runs, events } = input;
  const reached = highestTierRank(session, events);
  const tasks = input.tasks.filter(t => TIER_ORDER.indexOf(t.tier) <= reached);
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

  // A tier is fully solved only when every offered question passes its latest submit.
  const fullySolved = (x: (typeof rows)[number]) => !!x.final && x.final.total > 0 && x.final.passed === x.final.total;
  const highest = [...TIER_ORDER].reverse().find(t => {
    const tierRows = rows.filter(x => x.task.tier === t);
    return tierRows.length > 0 && tierRows.every(fullySolved);
  });
  const solved = rows.filter(fullySolved).length;
  const unlocked = `Unlocked ${Math.min(reached, MAX_UNLOCKS)} of ${MAX_UNLOCKS} further question sets.`;
  const outcome = highest
    ? `Solved ${solved} of ${rows.length} task(s); highest tier fully solved: ${highest}. ${unlocked}`
    : `Solved ${solved} of ${rows.length} task(s); no tier fully solved yet. ${unlocked}`;

  // Focus areas: topics of tasks not fully solved, then behaviour signals from the AI score.
  const focus = new Set<string>();
  for (const x of rows) if (!(x.final && x.final.total > 0 && x.final.passed === x.final.total)) for (const t of x.task.dsa_topics ?? []) focus.add(`Practice ${t.replace(/_/g, ' ')} (${x.task.tier} task not fully solved)`);
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
    tasks: rows.map(x => x.row).slice(0, MAX_REPORT_TASKS),
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
