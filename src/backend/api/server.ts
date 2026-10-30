import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { createDevPorts } from './dev-stubs.js';

try {
  const config = readConfig();
  const app = await buildApp({ ports: createDevPorts() });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    void app.close().catch(() => { process.exitCode = 1; });
  });
  const address = await app.listen({ host: config.host, port: config.port });
  console.log(`TorqueCode skeleton: ${address}; candidate execution disabled`);
} catch {
  console.error('Backend failed to start; check configuration and local dependencies.');
  process.exitCode = 1;
}
