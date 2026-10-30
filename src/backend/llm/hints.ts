// Reusable Ports['nextHint'] for any task (seed or generated) via a trusted resolver.
// Returns one level at a time; the ladder itself never leaves this function.
import type { Context, SeamResult } from '../contracts/internal.js';
import type { Ports } from '../contracts/seams.js';

/** Server-side lookup of a task's pre-validated hint ladder (e.g. from the assessment store). */
export type HintLadderResolver = (taskId: string, context: Context) => Promise<readonly string[] | null>;

export function createHintProvider(resolveLadder: HintLadderResolver): Ports['nextHint'] {
  return async (input, context): Promise<SeamResult<{ text: string; level: number }>> => {
    context.signal.throwIfAborted();
    const ladder = await resolveLadder(input.task_id, context);
    context.signal.throwIfAborted();
    if (!ladder || ladder.length === 0) return { kind: 'unavailable', code: 'NOT_IMPLEMENTED', message: 'Hint unavailable' };
    // Clamp to the ladder: level 3 on a 2-step ladder serves the last step.
    const level = Math.min(Math.max(1, Math.trunc(input.level)), ladder.length);
    const text = ladder[level - 1];
    if (typeof text !== 'string' || text.trim() === '') return { kind: 'unavailable', code: 'NOT_IMPLEMENTED', message: 'Hint unavailable' };
    return { kind: 'ok', value: { text, level } };
  };
}
