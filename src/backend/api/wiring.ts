import type { PrivateTask } from '../contracts/internal.js';
import type { Ports } from '../contracts/seams.js';
import { parsePortfolio } from '../intake/portfolio.js';
import { quiz } from '../intake/quiz.js';
import { calculateAie } from '../scoring/aie.js';
import { buildReport } from '../scoring/report.js';
import { createDevPorts } from './dev-stubs.js';

// Only API wiring changes when Rithvik's isolated runner/LLM implementations merge.
export function createWiredPorts(seed: PrivateTask, overrides: Partial<Ports> = {}): Ports {
  return { ...createDevPorts(), parsePortfolio, quiz, calculateAie, buildReport,
    nextHint: async (input, context) => {
      context.signal.throwIfAborted();
      const text = input.task_id === seed.task_id ? seed.hint_ladder[input.level - 1] : undefined;
      return text ? { kind: 'ok', value: { text, level: input.level } } : {
        kind: 'unavailable', code: 'NOT_IMPLEMENTED', message: 'Hint unavailable',
      };
    }, ...overrides };
}
