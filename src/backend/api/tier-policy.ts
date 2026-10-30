import type { InternalRunResult, Tier } from '../contracts/internal.js';

// Pranav's locked Q1 defaults.
export const TIER_ORDER = ['novice', 'adept', 'master'] as const;

export const SESSION_BUDGET_SECONDS = 60 * 60;

export function nextTier(current: Tier): Tier | null {
  const index = TIER_ORDER.indexOf(current);
  return TIER_ORDER[index + 1] ?? null;
}

// K10: Pranav's 03:00 rule — attempted, not solved.
// Input runs must already have passed trusted API-side validation.
export function allQuestionsSubmitted(
  taskIds: readonly string[],
  runs: readonly InternalRunResult[],
): boolean {
  if (
    taskIds.length === 0 ||
    new Set(taskIds).size !== taskIds.length
  ) return false;

  return taskIds.every(taskId =>
    runs.some(run =>
      run.task_id === taskId &&
      run.mode === 'submit' &&
      run.total > 0 &&
      run.tests.length === run.total &&
      run.passed === run.tests.filter(
        test => test.status === 'pass'
      ).length
    )
  );
}
