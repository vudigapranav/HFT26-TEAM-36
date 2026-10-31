import type { PrivateTask } from '../contracts/internal.js';
import type { Ports } from '../contracts/seams.js';
import { parsePortfolio } from '../intake/portfolio.js';
import { quiz } from '../intake/quiz.js';
import { calculateAie } from '../scoring/aie.js';
import { buildReport } from '../scoring/report.js';
import { createDockerRunner, runTestsInDocker } from '../runner/dockerRunner.js';
import { runTestsInE2B } from '../runner/e2bRunner.js';
import { runSeedTests } from '../runner/local/seed-runner.js';
import { DEFAULT_RUNNER_IMAGE } from './runner-status.js';
import { createDevPorts } from './dev-stubs.js';
import { chat } from '../llm/featherless.js';
import { createValidationEngine } from '../generation/validate.js';
import { withReceiptCache } from '../generation/receipts.js';
import { createGenerator } from '../generation/generate.js';
import { loadSeedBank } from './seed-bank.js';

// Only API wiring changes when Rithvik's isolated runner/LLM implementations merge.
export function createWiredPorts(seed: PrivateTask, overrides: Partial<Ports> = {}): Ports {
  const wired: Ports = { ...createDevPorts(), parsePortfolio, quiz, calculateAie, buildReport, chat,
    // The default instance captures env at import. Normalize an explicit empty image without changing R2.
    runTests: process.env.RUNNER === 'e2b' ? runTestsInE2B
      : process.env.RUNNER === 'docker'
      ? process.env.RUNNER_IMAGE === '' ? createDockerRunner({ image: DEFAULT_RUNNER_IMAGE }) : runTestsInDocker
      : runSeedTests,
    nextHint: async (input, context) => {
      context.signal.throwIfAborted();
      const text = input.task_id === seed.task_id ? seed.hint_ladder[input.level - 1] : undefined;
      return text ? { kind: 'ok', value: { text, level: input.level } } : {
        kind: 'unavailable', code: 'NOT_IMPLEMENTED', message: 'Hint unavailable',
      };
    }, ...overrides };
  const validateTask =
    // Verified receipts are reused only for byte-identical tasks under the same policy, code, harness and runner.
    overrides.validateTask ?? withReceiptCache(createValidationEngine(wired.runTests));

  return {
    ...wired,
    validateTask,
    generateAssessment: overrides.generateAssessment ??
      createGenerator({
        chat: wired.chat,
        runTests: wired.runTests,
        validateTask,
        seedBank: loadSeedBank,
      }),
  };
}
