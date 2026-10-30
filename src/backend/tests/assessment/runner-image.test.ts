import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_RUNNER_IMAGE } from '../../api/runner-status.js';
import { createWiredPorts } from '../../api/wiring.js';
import { createDockerRunner } from '../../runner/dockerRunner.js';
import { loadSeed } from '../../runner/local/seed-runner.js';
vi.mock('../../runner/dockerRunner.js', () => ({
  runTestsInDocker: vi.fn(), createDockerRunner: vi.fn(() => vi.fn()),
}));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('uses the default image for an explicitly empty RUNNER_IMAGE, matching the startup probe', async () => {
  vi.stubEnv('RUNNER', 'docker'); vi.stubEnv('RUNNER_IMAGE', '');
  createWiredPorts(await loadSeed());
  expect(createDockerRunner).toHaveBeenCalledExactlyOnceWith({ image: DEFAULT_RUNNER_IMAGE });
});
