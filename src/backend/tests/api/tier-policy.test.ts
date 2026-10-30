import { describe, expect, it } from 'vitest';
import type { InternalRunResult } from '../../contracts/internal.js';
import {
  SESSION_BUDGET_SECONDS,
  nextTier,
  allQuestionsSubmitted,
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

describe('K10 session policy', () => {
  it('uses one 60-minute session', () => {
    expect(SESSION_BUDGET_SECONDS).toBe(3600);
  });

  it('supports at most two forward unlocks', () => {
    expect(nextTier('novice')).toBe('adept');
    expect(nextTier('adept')).toBe('master');
    expect(nextTier('master')).toBeNull();
  });
});

describe('K10 attempt-based unlocking', () => {
  const failed = makeRun('submit', ['fail', 'pass']);
  const another = {
    ...makeRun('submit', ['fail']),
    task_id: 'task-adept',
  };

  it('counts an incorrect submission as an attempt', () => {
    expect(allQuestionsSubmitted(['task-novice'], [failed]))
      .toBe(true);
  });

  it('requires every question in the set to be submitted', () => {
    expect(allQuestionsSubmitted(
      ['task-novice', 'task-adept'], [failed]
    )).toBe(false);

    expect(allQuestionsSubmitted(
      ['task-novice', 'task-adept'], [failed, another]
    )).toBe(true);
  });

  it('does not count Run as Submit', () => {
    expect(allQuestionsSubmitted(
      ['task-novice'], [makeRun('run', ['pass'])]
    )).toBe(false);
  });

  it('rejects empty question sets', () => {
    expect(allQuestionsSubmitted([], [failed])).toBe(false);
  });
});
