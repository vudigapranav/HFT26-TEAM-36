// Every API shape comes from the backend's public contracts (@torquecode/contracts). Never redefine them here.
import type {Static} from 'typebox';
import type {
  ApiError as ApiErrorSchema, AssessmentState as AssessmentStateSchema, AssistantResponse as AssistantResponseSchema,
  AuthUserResponse as AuthUserResponseSchema, CandidateTask as CandidateTaskSchema, ClientEvent as ClientEventSchema,
  FocusLaneResponse as FocusLaneResponseSchema, HintResponse as HintResponseSchema, PortfolioResponse as PortfolioResponseSchema,
  QuizResponse as QuizResponseSchema, ReportHistory as ReportHistorySchema,
} from '@torquecode/contracts';
export type {AieScore, AuthUser, CandidateProfile, File, Portfolio, QuizQuestion, Report, RunResult} from '@torquecode/contracts';
export type ApiErrorBody = Static<typeof ApiErrorSchema>;
export type AssessmentState = Static<typeof AssessmentStateSchema>;
export type Generation = NonNullable<AssessmentState['generation']>;
export type AssistantResponse = Static<typeof AssistantResponseSchema>;
export type AuthUserResponse = Static<typeof AuthUserResponseSchema>;
export type CandidateTask = Static<typeof CandidateTaskSchema>;
export type ClientEvent = Static<typeof ClientEventSchema>;
export type FocusLaneResponse = Static<typeof FocusLaneResponseSchema>;
export type FocusLane = FocusLaneResponse['focus_lane'];
export type HintResponse = Static<typeof HintResponseSchema>;
export type PortfolioResponse = Static<typeof PortfolioResponseSchema>;
export type QuizResponse = Static<typeof QuizResponseSchema>;
export type ReportHistory = Static<typeof ReportHistorySchema>;
