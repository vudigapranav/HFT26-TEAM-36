import { Type, type Static } from 'typebox';

const object = <T extends Parameters<typeof Type.Object>[0]>(fields: T) =>
  Type.Object(fields, { additionalProperties: false });
const text = (maxLength = 1000) => Type.String({ minLength: 1, maxLength });
export const Id = Type.String({ minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9_-]+$' });
export const Tier = Type.Enum(['novice', 'adept', 'master']);
export const Domain = Type.Enum(['web', 'ml', 'security', 'backend']);
export const Topic = Type.Enum([
  'arrays', 'strings', 'hashing', 'two_pointers', 'sliding_window', 'stack', 'queue',
  'binary_search', 'sorting', 'recursion', 'linked_list', 'trees', 'bfs_dfs', 'graphs',
  'heap', 'greedy', 'dp', 'trie', 'union_find',
]);
export const File = object({
  path: Type.String({ minLength: 1, maxLength: 200, pattern: '^(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]+\\.[a-zA-Z0-9]+$' }),
  content: Type.String({ maxLength: 65_536 }),
  editable: Type.Boolean(),
});
export const Portfolio = object({
  candidate: object({ name: text(120), email: Type.String({ format: 'email', maxLength: 254 }) }),
  projects: Type.Array(object({
    name: text(120), description: text(4000), tech_stack: Type.Array(text(60), { maxItems: 30 }),
    role: text(200), highlights: Type.Array(text(1000), { maxItems: 20 }),
  }), { maxItems: 20 }),
  tech_stack: Type.Array(text(60), { maxItems: 50 }),
  skills: Type.Array(text(100), { maxItems: 50 }),
  dsa_topics_solved: Type.Array(text(60), { maxItems: 50 }),
});
export const CandidateProfile = object({
  domain: Domain, domain_confidence: Type.Number({ minimum: 0, maximum: 1 }),
  claimed_topics: Type.Array(Topic, { minItems: 1, maxItems: 19, uniqueItems: true }),
  tech_stack: Type.Array(text(60), { maxItems: 50 }),
  skills: Type.Array(text(100), { maxItems: 50 }),
});
export const Task = object({
  task_id: Id, tier: Tier, domain: Domain,
  language: Type.Union([Type.Literal('python'), Type.Literal('javascript')]),
  task_type: Type.Union([Type.Literal('bug_fix'), Type.Literal('feature'), Type.Literal('extension')]),
  title: text(200), statement_md: text(12_000),
  dsa_topics: Type.Array(Topic, { minItems: 1, maxItems: 19, uniqueItems: true }),
  files: Type.Array(File, { minItems: 1, maxItems: 20 }),
  visible_tests: Type.Array(object({ id: text(200), path: text(200), content: Type.String({ maxLength: 65_536 }) }), { maxItems: 30 }),
  source: Type.Union([Type.Literal('generated'), Type.Literal('seed_bank')]),
});
export const TestResult = object({
  id: text(200),
  status: Type.Enum(['pass', 'fail', 'error', 'timeout']),
  duration_ms: Type.Number({ minimum: 0 }),
});
export const RunResult = object({
  run_id: Id, task_id: Id, mode: Type.Union([Type.Literal('run'), Type.Literal('submit')]),
  visible: Type.Array(TestResult, { maxItems: 100 }),
  hidden: Type.Union([Type.Null(), object({ passed: Type.Integer({ minimum: 0 }), total: Type.Integer({ minimum: 0 }) })]),
  passed: Type.Integer({ minimum: 0 }), total: Type.Integer({ minimum: 0 }),
  stdout: Type.String({ maxLength: 65_536 }), stderr: Type.String({ maxLength: 65_536 }),
  timed_out: Type.Boolean(),
});
export const ClientEvent = object({
  task_id: Id, client_ts: Type.String({ format: 'date-time' }),
  type: Type.Enum(['tab_hidden', 'tab_visible', 'copy', 'paste']),
  payload: object({ size: Type.Optional(Type.Integer({ minimum: 0, maximum: 1_000_000 })) }),
});
export const EventsRequest = object({ events: Type.Array(ClientEvent, { minItems: 1, maxItems: 100 }) });
export const ApiError = object({ error: object({
  code: text(80), message: text(300), request_id: text(100),
  fields: Type.Optional(Type.Array(object({ path: text(200), message: text(300) }), { maxItems: 50 })),
}) });
export const Health = object({
  status: Type.Enum(['ok', 'degraded']), mode: Type.Enum(['skeleton', 'auth']), candidate_execution: Type.Boolean(),
  runner: Type.Optional(Type.Enum(['immutable_seed_only', 'isolated'])),
  runner_available: Type.Optional(Type.Boolean()), runner_image: Type.Optional(Type.String({ maxLength: 256 })),
});
export const GenerationProgress = object({
  assessment_id: Id,
  status: Type.Enum(['queued', 'generating', 'validating', 'ready', 'failed']),
  tier: Type.Union([Tier, Type.Null()]),
});
export const QuizQuestion = object({ id: Id, prompt: text(2000), options: Type.Array(object({ id: Id, text: text(1000) }), { minItems: 1, maxItems: 10 }) });
export const AieScore = object({
  score: Type.Number({ minimum: 0, maximum: 20 }), max: Type.Literal(20),
  independence: Type.Number({ minimum: 0, maximum: 1 }), hint_yield: Type.Number({ minimum: 0, maximum: 1 }),
  test_discipline: Type.Number({ minimum: 0, maximum: 1 }), gate: Type.Number({ minimum: 0, maximum: 1 }),
});
export const Report = object({
  report_id: Id, session_id: Id,
  tasks: Type.Array(object({ task_id: Id, passed: Type.Integer({ minimum: 0 }), total: Type.Integer({ minimum: 0 }),
    time_sec: Type.Number({ minimum: 0 }), hints_used: Type.Integer({ minimum: 0 }), aie: Type.Union([AieScore, Type.Null()]),
  }), { maxItems: 20 }),
  final_score: Type.Number({ minimum: 0, maximum: 100 }), outcome: text(300),
  focus_areas: Type.Array(text(300), { maxItems: 50 }),
  integrity_signals: Type.Array(object({ type: text(80), count: Type.Integer({ minimum: 0 }) }), { maxItems: 20 }),
});
export type Portfolio = Static<typeof Portfolio>;
export type CandidateProfile = Static<typeof CandidateProfile>;
export type Task = Static<typeof Task>;
export type File = Static<typeof File>;
export type RunResult = Static<typeof RunResult>;
export type TestResult = Static<typeof TestResult>;
export type GenerationProgress = Static<typeof GenerationProgress>;
export type Tier = Static<typeof Tier>;
export type Topic = Static<typeof Topic>;
export type Domain = Static<typeof Domain>;
export type QuizQuestion = Static<typeof QuizQuestion>;
export type AieScore = Static<typeof AieScore>;
export type Report = Static<typeof Report>;

// K2 auth fields are separate from assessment Session and CandidateProfile.
export const AuthCredentials = object({
  email: Type.String({ format: 'email', minLength: 3, maxLength: 254 }),
  password: Type.String({ minLength: 12, maxLength: 128 }),
});
export const AuthUserResponse = object({ user: object({
  user_id: Type.String({ format: 'uuid' }), email: Type.String({ format: 'email', maxLength: 254 }),
}) });

// K3/K4-lite additive responses. OPEN policies remain visible to consumers.
export const PortfolioResponse = object({
  profile: CandidateProfile,
  warnings: Type.Array(Type.String({ maxLength: 4000 }), { maxItems: 200 }),
  injection_flags: Type.Array(Type.String({ maxLength: 200 }), { maxItems: 500 }),
});
export const FocusLane = object({ domain: Domain, skills: Type.Array(text(100), { maxItems: 50 }), topics: Type.Array(Topic, { minItems: 1, maxItems: 19 }) });
export const QuizResponse = object({ questions: Type.Array(QuizQuestion, { maxItems: 10 }) });
export const QuizAnswers = object({ answers: Type.Array(object({ question_id: Id, option_id: Id }), { maxItems: 10 }) });
export const FocusLaneResponse = object({ focus_lane: FocusLane });
export const AssessmentState = object({
  assessment_id: Id, report_id: Id, task_id: Id, current_tier: Tier,
  status: Type.Enum(['active', 'finished']), started_at: Type.String({ format: 'date-time' }),
  expires_at: Type.String({ format: 'date-time' }), remaining_sec: Type.Integer({ minimum: 0, maximum: 3600 }),
  policy_todos: Type.Array(Type.String({ maxLength: 80 }), { maxItems: 5 }),
  runner: Type.Enum(['immutable_seed_only', 'isolated']),
  runner_available: Type.Optional(Type.Boolean()), runner_image: Type.Optional(Type.String({ maxLength: 256 })),
  auto_submit_error: Type.Optional(Type.String({ maxLength: 80 })),
});
export const TaskFilesRequest = object({ files: Type.Array(File, { minItems: 1, maxItems: 20 }) });
export const RunFilesRequest = object({ files: Type.Optional(Type.Array(File, { minItems: 1, maxItems: 20 })) });
export const HintResponse = object({ level: Type.Integer({ minimum: 1, maximum: 3 }), text: text(4000) });
export type AuthUser = Static<typeof AuthUserResponse>['user'];
