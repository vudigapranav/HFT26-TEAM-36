import type { Report } from '@torquecode/contracts';
import type { CandidateProfile, Event, FocusLane, InternalRunResult, PrivateTask, Session, Tier } from '../contracts/internal.js';
export type TierWork = { task: PrivateTask; files: PrivateTask['files']; hint_level: number };
export type StoredProfile = { profile: CandidateProfile; focus_lane?: FocusLane; portfolio?: unknown; reuploaded?: boolean };
export type GenerationJob = { status: 'queued'|'generating'|'validating'|'ready'|'failed'; progress: Record<string,unknown>; receipts: {gate:string;status:string;reason:string}[]; source?: 'generated'|'seed_bank' };
export type AssessmentRecord = {
 session: Session; task: PrivateTask; files: PrivateTask['files']; events: Event[]; runs: InternalRunResult[];
 tier_work?: Partial<Record<Tier,TierWork>>; question_sets?: Partial<Record<Tier,TierWork[]>>; unlocked_tiers?: Tier[];
 hint_level: number; hint_pending?: boolean; assistant_pending?: boolean; operation?: Promise<InternalRunResult>; expiry?: Promise<void>; auto_submit_error?: string;
 profile_id?: string; profile_snapshot?: CandidateProfile; portfolio_snapshot?: unknown; focus_snapshot?: FocusLane; generation?: GenerationJob;
};
// Explicit in-memory adapter for unit tests. The server always selects PostgresAssessmentStore.
export class AssessmentStore {
 private readonly memoryProfiles = new Map<string,StoredProfile>();
 private readonly memoryAssessments = new Map<string,AssessmentRecord>();
 get profiles() { return this.memoryProfiles; }
 get assessments() { return this.memoryAssessments; }
 get max_profiles() { return Infinity; }
 get max_assessments() { return Infinity; }
 get durable() { return false; }
 async withUser<T>(_userId:string,_id:string|undefined,action:()=>Promise<T>,_includeActive=false):Promise<T> { return action(); }
 async pendingExpirations():Promise<{user_id:string;id:string}[]> { return [...this.assessments.values()].filter(r => !r.expiry && Date.now()>=Date.parse(r.session.expires_at)).map(r=>({user_id:r.session.user_id,id:r.session.id})); }
 async pendingGenerations():Promise<{user_id:string;id:string}[]> { return []; }
 async withGenerationClaim(_id:string,action:()=>Promise<void>) { await action(); }
 async enforceRunRate(_record:AssessmentRecord) {}
 saveReport(_id:string,_report:Report) {}
 async readReport(_id:string):Promise<Report|undefined> { return undefined; }
 async reportHistory(_before?:string):Promise<{id:string;created_at:string;final_score:number;outcome:string}[]> { return []; }
}
