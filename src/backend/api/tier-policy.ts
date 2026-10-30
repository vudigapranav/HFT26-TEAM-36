import type { InternalRunResult, Tier } from '../contracts/internal.js';

// Pranav's locked Q1 defaults.
export const TIER_ORDER = ['novice', 'adept', 'master'] as const;

export const TIER_BUDGET_SECONDS: Record<Tier, number> = {
  novice: 15 * 60,
  adept: 20 * 60,
  master: 25 * 60,
};

export const SESSION_BUDGET_SECONDS = 60 * 60;

export function nextTier(current: Tier): Tier | null {
  const index = TIER_ORDER.indexOf(current);
  return TIER_ORDER[index + 1] ?? null;
}

export function finalSubmitPassed(
  runs: InternalRunResult[],
  taskId: string,
): boolean {
  const final = runs.filter(
    run => run.task_id === taskId && run.mode === 'submit',
  ).at(-1);

  return Boolean(
    final &&
    final.total > 0 &&
    final.passed === final.total &&
    final.tests.length === final.total &&
    final.tests.every(test => test.status === 'pass')
  );
}
