import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { createDevPorts } from './dev-stubs.js';
import { createPool } from './db/pool.js';

let pool: ReturnType<typeof createPool> | undefined;
try {
  const config = readConfig();
  pool = config.mode === 'auth' ? createPool(config.database_url) : undefined;
  if (pool) await pool.query('SELECT user_id FROM auth_users LIMIT 0');
  const app = await buildApp({ ports: createDevPorts(), ...(pool && config.mode === 'auth' ? {
    auth: { pool, origin: config.auth_origin, secure: config.secure_cookies },
  } : {}) });
  if (pool) { const appPool = pool; app.addHook('onClose', async () => { await appPool.end(); }); }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    void app.close().catch(() => { process.exitCode = 1; });
  });
  const address = await app.listen({ host: config.host, port: config.port });
  console.log(`TorqueCode ${config.mode}: ${address}; candidate execution disabled`);
} catch {
  if (pool) await pool.end();
  console.error('Backend failed to start; check configuration, migrations and local dependencies.');
  process.exitCode = 1;
}
