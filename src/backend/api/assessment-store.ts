import type { CandidateProfile, Event, FocusLane, InternalRunResult, PrivateTask, Session } from '../contracts/internal.js';

export type AssessmentRecord = {
  session: Session; task: PrivateTask; files: PrivateTask['files']; events: Event[]; runs: InternalRunResult[];
  hint_level: number; hint_pending?: boolean; operation?: Promise<InternalRunResult>; expiry?: Promise<void>; auto_submit_error?: string;
};
// Deliberately process-local checkpoint storage: restart loses portfolio/assessment state, never auth users.
export class AssessmentStore {
  readonly profiles = new Map<string, { profile: CandidateProfile; focus_lane?: FocusLane }>();
  readonly assessments = new Map<string, AssessmentRecord>();
  readonly max_profiles = 100;
  readonly max_assessments = 100;
}
