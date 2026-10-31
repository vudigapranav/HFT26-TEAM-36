// Server-only. Deliberately absent from the contracts package exports/build.
import type { AieScore, CandidateProfile, Domain, File, GenerationProgress, QuizQuestion, Report, RunResult, Task, TestResult, Tier, Topic } from './public.js';

export type { AieScore, CandidateProfile, Domain, File, GenerationProgress, QuizQuestion, Report, RunResult, Task, TestResult, Tier, Topic };
export type Limits = { wall_time_ms: number; memory_mb: number; cpu_count: number; pids: number; output_bytes: number };
export type TestFile = { path: string; content: string; visibility: 'visible' | 'hidden'; ids: string[] };
export type PrivateTask = Task & {
  family_id?: string;
  reference_files: File[]; tests: TestFile[]; hint_ladder: string[];
  limits: Limits; f2p_ids: string[]; p2p_ids: string[];
};
export type RunRequest = {
  task_id: string; files: File[]; tests: TestFile[]; mode: 'run' | 'submit'; limits: Limits;
};
export type InternalRunResult = {
  run_id: string; task_id: string; mode: 'run' | 'submit';
  tests: (TestResult & { visibility: 'visible' | 'hidden' })[];
  passed: number; total: number; stdout: string; stderr: string; timed_out: boolean;
};
export type Gate = { gate: 'schema' | 'topics' | 'imports' | 'format' | 'reference' | 'differential' | 'starter' | 'examples' | 'performance' | 'leakage'; status: 'pass' | 'fail' | 'skipped' | 'not_applicable'; reason: string };
export type ValidationReceipt = { task_id: string; valid: boolean; structural_valid?: boolean; semantic_verified?: boolean; family_id?: string; gates: Gate[] };
export type Session = { id: string; user_id: string; started_at: string; expires_at: string; current_tier: Tier; status: 'active' | 'finished' };
export type Event = { session_id: string; task_id: string; ts: string; source: 'server' | 'client'; type: 'file_edit_snapshot' | 'run' | 'submit' | 'hint_request' | 'hint_served' | 'assistant_message' | 'assistant_blocked' | 'extraction_flagged' | 'tab_hidden' | 'tab_visible' | 'copy' | 'paste' | 'tier_unlocked' | 'tier_upgraded' | 'session_end'; payload: Record<string, unknown> };
export type FocusLane = { domain: Domain; skills: string[]; topics: Topic[] };
export type Context = { signal: AbortSignal };
export type AssistantContext = { task: Task; files: File[]; visible_failures: TestResult[]; message: string; history: { role: 'user' | 'assistant'; content: string }[] };
// A separate server-side filter may access reference code; never add it to AssistantContext.
export type ChatRequest = { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; model: string; purpose: 'generation' | 'assistant'; max_tokens: number };
export type Unavailable = { kind: 'unavailable'; code: 'NOT_IMPLEMENTED' | 'SANDBOX_UNAVAILABLE' | 'LLM_UNAVAILABLE' | 'INVALID_REQUEST' | 'LLM_UNAVAILABLE' | 'INVALID_REQUEST'; message: string };
export type Fixture<T> = { kind: 'fixture'; value: T };
export type SeamResult<T> = { kind: 'ok'; value: T } | Fixture<T> | Unavailable;
