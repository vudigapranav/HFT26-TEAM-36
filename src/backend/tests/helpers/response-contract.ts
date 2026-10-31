import { expect } from 'vitest';
import Value from 'typebox/value';
import { ApiError, AssessmentState, AssistantResponse, CandidateTask, AuthUserResponse, FocusLaneResponse, Health, HintResponse, PortfolioResponse, QuizResponse, Report, ReportHistory, RunResult } from '@torquecode/contracts';
import { Type } from 'typebox';

const acknowledgement = Type.Object({ ok: Type.Literal(true) }, { additionalProperties: false });
type Response = { statusCode: number; body: string; json: () => unknown };
export function checkResponseContract(method: string, url: string, response: Response): void {
  if (response.statusCode === 204) { expect(response.body).toBe(''); return; }
  const path = url.split('?')[0]!;
  const schema = response.statusCode >= 400 ? ApiError
    : path === '/health' ? Health
    : path.startsWith('/auth/') ? AuthUserResponse
    : path === '/portfolio' ? PortfolioResponse
    : path === '/onboarding-quiz' ? method === 'GET' ? QuizResponse : FocusLaneResponse
    : path === '/assessments' || /^\/assessments\/[^/]+\/status$/.test(path) ? AssessmentState
    : /^\/assessments\/[^/]+\/tier\/upgrade$/.test(path) ? AssessmentState
    : /^\/assessments\/[^/]+\/tasks\/[^/]+$/.test(path) ? CandidateTask
    : /\/(run|submit)$/.test(path) ? RunResult
    : /\/hint$/.test(path) ? HintResponse
    : /\/assistant$/.test(path) ? AssistantResponse
    : /\/(files|events)$/.test(path) ? acknowledgement
    : path === '/reports' ? ReportHistory : /^\/reports\/[^/]+$/.test(path) ? Report : undefined;
  expect(schema, `No response contract for ${method} ${url}`).toBeDefined();
  const value = response.json();
  expect(Value.Check(schema!, value), `Invalid ${method} ${url} response: ${JSON.stringify([...Value.Errors(schema!, value)])}`).toBe(true);
}
