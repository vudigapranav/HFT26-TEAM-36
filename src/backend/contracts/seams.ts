import type { PortfolioEvidence } from '../intake/evidence.js';
import type { AieScore, AssistantContext, CandidateProfile, ChatRequest, Context, Event, FocusLane, GenerationProgress, InternalRunResult, PrivateTask, QuizQuestion, Report, RunRequest, SeamResult, Session, Topic, ValidationReceipt } from './internal.js';

// Every asynchronous boundary has caller-controlled cancellation.
export interface Ports {
  runTests(input: RunRequest, context: Context): Promise<SeamResult<InternalRunResult>>;
  chat(input: ChatRequest, context: Context): Promise<SeamResult<{ content: string; model: string }>>;
  nextHint(input: { task_id: string; level: 1 | 2 | 3 }, context: Context): Promise<SeamResult<{ text: string; level: number }>>;
  assistantReply(input: AssistantContext, context: Context): Promise<SeamResult<{ blocked: false; reply: string } | { blocked: true; reason: string }>>;
  generateAssessment(input: { profile: CandidateProfile; focus_lane: FocusLane; evidence?: PortfolioEvidence; progress: (event: GenerationProgress) => void }, context: Context): Promise<SeamResult<{ novice: PrivateTask; adept: PrivateTask; master: PrivateTask }>>;
  validateTask(input: { task: PrivateTask; claimed_topics: Topic[] }, context: Context): Promise<SeamResult<ValidationReceipt>>;
  parsePortfolio(input: unknown): SeamResult<CandidateProfile | { errors: { path: string; message: string }[] }>;
  quiz(input: { profile: CandidateProfile; answers?: { question_id: string; option_id: string }[] }): SeamResult<{ questions: QuizQuestion[] } | { focus_lane: FocusLane }>;
  calculateAie(input: { events: Event[]; runs: InternalRunResult[]; task: PrivateTask }): SeamResult<AieScore>;
  buildReport(input: { profile?: CandidateProfile | undefined; session: Session; tasks: PrivateTask[]; runs: InternalRunResult[]; events: Event[] }): SeamResult<Report>;
}
