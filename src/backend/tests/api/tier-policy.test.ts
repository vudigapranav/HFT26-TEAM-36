import { describe, expect, it } from 'vitest';
import type { InternalRunResult } from '../../contracts/internal.js';
import {
  TIER_BUDGET_SECONDS,
  SESSION_BUDGET_SECONDS,
  nextTier,
  finalSubmitPassed,
} from '../../api/tier-policy.js';

function makeRun(
  mode: 'run' | 'submit',
  statuses: Array<'pass' | 'fail'>,
): InternalRunResult {
  return {
    run_id: 'test-run',
    task_id: 'task-novice',
    mode,
    tests: statuses.map((status, index) => ({
      id: `test-${index}`,
      status,
      visibility: index === 0 ? 'visible' : 'hidden',
      duration_ms: 1,
    })),
    passed: statuses.filter(s => s === 'pass').length,
    total: statuses.length,
    stdout: '',
    stderr: '',
    timed_out: false,
  };
}

describe('K10 tier policy', () => {
  it('allocates exactly 60 minutes', () => {
    expect(TIER_BUDGET_SECONDS).toEqual({
      novice: 900,
      adept: 1200,
      master: 1500,
    });
    expect(SESSION_BUDGET_SECONDS).toBe(3600);
  });

  it('progresses without skipping tiers', () => {
    expect(nextTier('novice')).toBe('adept');
    expect(nextTier('adept')).toBe('master');
    expect(nextTier('master')).toBeNull();
  });

  it('unlocks only after all visible and hidden tests pass', () => {
    expect(finalSubmitPassed(
      [makeRun('submit', ['pass', 'pass', 'pass'])],
      'task-novice',
    )).toBe(true);

    expect(finalSubmitPassed(
      [makeRun('submit', ['pass', 'fail'])],
      'task-novice',
    )).toBe(false);
  });

  it('does not unlock from an ordinary run', () => {
    expect(finalSubmitPassed(
      [makeRun('run', ['pass', 'pass'])],
      'task-novice',
    )).toBe(false);
  });

  it('uses the final submission, not an earlier pass', () => {
    expect(finalSubmitPassed([
      makeRun('submit', ['pass', 'pass']),
      makeRun('submit', ['pass', 'fail']),
    ], 'task-novice')).toBe(false);
  });

  it('rejects empty or incomplete grading results', () => {
    expect(finalSubmitPassed(
      [makeRun('submit', [])],
      'task-novice',
    )).toBe(false);

    expect(finalSubmitPassed([
      { ...makeRun('submit', ['pass']), passed: 2, total: 2 },
    ], 'task-novice')).toBe(false);
  });
});
