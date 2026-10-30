// P8 — claims vs demonstrated (owner: Pranav). Context §13 [RECOMMENDED]. Deterministic: profile + tasks + report rows.
//
// One entry per claimed topic, in the profile's order:
//   tested_by     = an ATTEMPTED session task (≥1 run or submit) whose dsa_topics include the topic and that has a
//                   report row; null if none. An offered-but-untouched task does not test anything (P11).
//   demonstrated  = that task's final submit passed every test (passed === total > 0); null when not tested
// When several attempted tasks test a topic, a fully solved one wins, then the higher tier, then task order.
import type { CandidateProfile, Report, Tier, Topic } from '@torquecode/contracts';
import type { Event, PrivateTask } from '../contracts/internal.js';

export type ClaimResult = { topic: Topic; tested_by: string | null; demonstrated: boolean | null };

const TIER_RANK: Record<Tier, number> = { novice: 0, adept: 1, master: 2 };

// Attempted = at least one run or submit event for the task.
export function attemptedTaskIds(events: Pick<Event, 'task_id' | 'type'>[]): Set<string> {
  return new Set(events.filter(e => e.type === 'run' || e.type === 'submit').map(e => e.task_id));
}

export function claimsVsDemonstrated(
  profile: Pick<CandidateProfile, 'claimed_topics'>,
  tasks: Pick<PrivateTask, 'task_id' | 'tier' | 'dsa_topics'>[],
  rows: Pick<Report['tasks'][number], 'task_id' | 'passed' | 'total'>[],
  attempted: ReadonlySet<string>,
): ClaimResult[] {
  const rowById = new Map(rows.map(r => [r.task_id, r]));
  const solved = (id: string) => { const r = rowById.get(id); return r !== undefined && r.total > 0 && r.passed === r.total; };

  return [...new Set(profile.claimed_topics)].map(topic => {
    const covering = tasks
      .map((task, i) => ({ task, i }))
      .filter(x => attempted.has(x.task.task_id) && rowById.has(x.task.task_id) && (x.task.dsa_topics ?? []).includes(topic))
      .sort((a, b) => Number(solved(b.task.task_id)) - Number(solved(a.task.task_id))
        || TIER_RANK[b.task.tier] - TIER_RANK[a.task.tier] || a.i - b.i);
    const best = covering[0];
    return best
      ? { topic, tested_by: best.task.task_id, demonstrated: solved(best.task.task_id) }
      : { topic, tested_by: null, demonstrated: null };
  });
}
