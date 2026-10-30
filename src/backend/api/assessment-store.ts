import type { CandidateProfile, Event, FocusLane, InternalRunResult, PrivateTask, Session, Tier } from '../contracts/internal.js';

export type TierWork = {
  task: PrivateTask;
  files: PrivateTask['files'];
  hint_level: number;
};

export type AssessmentRecord = {
  session: Session; task: PrivateTask; files: PrivateTask['files']; events: Event[]; runs: InternalRunResult[];
  // K10: per-tier state; optional during migration of existing fixtures.
  tier_work?: Partial<Record<Tier, TierWork>>;
  unlocked_tiers?: Tier[];
  hint_level: number; hint_pending?: boolean; operation?: Promise<InternalRunResult>; expiry?: Promise<void>; auto_submit_error?: string;
};
// Deliberately process-local checkpoint storage: restart loses portfolio/assessment state, never auth users.
export class AssessmentStore {
  readonly profiles = new Map<string, { profile: CandidateProfile; focus_lane?: FocusLane }>();
  readonly assessments = new Map<string, AssessmentRecord>();
  readonly max_profiles = 100;
  readonly max_assessments = 100;
}
