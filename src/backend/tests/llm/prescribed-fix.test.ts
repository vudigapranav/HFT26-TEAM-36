// Live regression: the assistant stated the exact fix in prose ("`X` instead of `Y`") for the
// master seed, and the guard let it through because the fix is a substring of the buggy line.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STANDARD_POLICY, checkOutput, solutionFingerprint } from '../../llm/guards.js';

const seed = (side: 'starter' | 'reference', path: string) => ({
  path, editable: true, content: readFileSync(new URL(`../../seed_bank/master_session_window/${side}/${path}`, import.meta.url), 'utf8').replace(/\r/g, ''),
});
const starter = ['app/report.py', 'app/window.py'].map(p => seed('starter', p));
const reference = ['app/report.py', 'app/window.py'].map(p => seed('reference', p));
const context = { files: starter, fingerprint: solutionFingerprint(reference, starter), policy: STANDARD_POLICY };

describe('assistant must not state the fix in prose', () => {
  it('blocks the reply that leaked the answer live', () => {
    const leaked = 'The `build_report` function has a bug in the `length` calculation: it uses `max(0, end - start - 1)` instead of `end - start`. This undercounts the length by 1, causing the visible test failures.';
    expect(checkOutput(leaked, context)).toEqual({ ok: false, code: 'prescribed_fix' });
  });

  it.each([
    'The length should be `end - start`.',
    'Change the length to `end - start` and the tests pass.',
    'Replace `max(0, end - start - 1)` with `end - start`.',
  ])('blocks other phrasings: %s', reply => {
    expect(checkOutput(reply, context).ok).toBe(false);
  });

  it('still allows Socratic guidance that points at the area without the replacement', () => {
    const hint = 'Look at how `build_report` computes `length`. A half-open span from start to end: how many items does it hold? Try it by hand with start=2 and end=5.';
    expect(checkOutput(hint, context)).toEqual({ ok: true });
  });
});
