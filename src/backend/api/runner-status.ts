import { execFile } from 'node:child_process';

export type RunnerStatus = {
  runner: 'immutable_seed_only' | 'isolated'; available: boolean; image?: string;
};
export const DEFAULT_RUNNER_IMAGE = 'torquecode-runner-python:dev';
export function inspectDockerImage(image: string): Promise<boolean> {
  return new Promise(resolve => {
    execFile('docker', ['image', 'inspect', image], { timeout: 5000, maxBuffer: 65536 }, error => resolve(!error));
  });
}
// Call once at application startup. A missing binary/daemon/image degrades health, never prevents startup.
export async function checkRunner(env: NodeJS.ProcessEnv = process.env, inspect = inspectDockerImage): Promise<RunnerStatus> {
  // RUNNER=e2b: isolated cloud sandboxes; usable only with an API key (each run then reports its own failures).
  if (env.RUNNER === 'e2b') return { runner: 'isolated', image: `e2b:${env.E2B_TEMPLATE || 'torquecode-runner-python'}`, available: Boolean(env.E2B_API_KEY) };
  if (env.RUNNER !== 'docker') return { runner: 'immutable_seed_only', available: true };
  const image = env.RUNNER_IMAGE || DEFAULT_RUNNER_IMAGE;
  return { runner: 'isolated', image, available: await inspect(image) };
}
