// Public API shapes from HFT26-TEAM-36 e04f5d0. Standalone type bridge;
// in the repository resolve this import to its existing @torquecode/contracts workspace package.
export interface AuthUser {user_id:string;email:string}
export interface Portfolio {candidate:{name:string;email:string};projects:{name:string;description:string;tech_stack:string[];role:string;highlights:string[]}[];tech_stack:string[];skills:string[];dsa_topics_solved:string[]}
export interface CandidateProfile {domain:string;domain_confidence:number;claimed_topics:string[];tech_stack:string[];skills:string[]}
export interface PortfolioResponse {profile:CandidateProfile;warnings:string[];injection_flags:string[]}
export interface FocusLane {domain:string;skills:string[];topics:string[]}
export interface QuizQuestion {id:string;prompt:string;options:{id:string;text:string}[]}
export interface File {path:string;content:string;editable:boolean}
export interface CandidateTask {task_id:string;title:string;statement_md:string;files:File[];visible_tests:{id:string;path:string;content:string}[];dsa_topics:string[];task_type:string;language:string;domain:string;source:string;assistant_enabled:boolean}
export interface AssessmentState {assessment_id:string;report_id:string;task_id:string;available_task_ids:string[];questions:{task_id:string;assistant_enabled:boolean}[];unlock_available:boolean;unlocks_used:number;status:'active'|'finished';started_at:string;expires_at:string;remaining_sec:number;runner_available?:boolean;auto_submit_error?:string}
export interface RunResult {run_id:string;task_id:string;mode:'run'|'submit';visible:{id:string;status:'pass'|'fail'|'error'|'timeout';duration_ms:number}[];hidden:{passed:number;total:number}|null;passed:number;total:number;stdout:string;stderr:string;timed_out:boolean}
export interface AieScore {score:number;max:20;independence:number;hint_yield:number;test_discipline:number;gate:number}
export interface Report {report_id:string;session_id:string;final_score:number;outcome:string;tasks:{task_id:string;passed:number;total:number;time_sec:number;hints_used:number;aie:AieScore|null}[];focus_areas:string[];integrity_signals:{type:string;count:number}[]}
