import { checkRunner } from './runner-status.js';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { createDevPorts } from './dev-stubs.js';
import { readAuthUser } from './auth.js';
import { PostgresAssessmentStore } from './postgres-assessment-store.js';
import { createWiredPorts } from './wiring.js';
import { loadSeedBank } from './seed-bank.js';
import { createPool } from './db/pool.js';

let pool: ReturnType<typeof createPool> | undefined;
try {
  const config = readConfig();
  pool = config.mode === 'auth' ? createPool(config.database_url) : undefined;
  if (pool) { await pool.query('SELECT user_id FROM auth_users LIMIT 0'); await pool.query('SELECT id FROM assessments LIMIT 0'); }
  const runner = await checkRunner();
  console.log(`Runner: ${runner.runner}${runner.image ? ` image=${runner.image}` : ''}; ${runner.available ? 'available' : 'unavailable'}`);
  const auth = pool && config.mode === 'auth' ? { pool, origin: config.auth_origin, secure: config.secure_cookies } : undefined;
  const seed_bank = auth ? await loadSeedBank() : undefined;
  const seed = seed_bank?.novice?.[0];
  const app = await buildApp({ runner, trust_proxy: config.mode === 'auth' && config.trust_proxy === true, ports: seed ? createWiredPorts(seed) : createDevPorts(), ...(auth && seed ? {
    auth, assessment: { store: new PostgresAssessmentStore(pool!), seed, seed_bank, origin: auth.origin, runner_status: runner,
      authenticate: async request => (await readAuthUser(request, auth))?.user_id },
  } : {}) });
  if (pool) { const appPool = pool; app.addHook('onClose', async () => { await appPool.end(); }); }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    void app.close().catch(() => { process.exitCode = 1; });
  });
  const address = await app.listen({ host: config.host, port: config.port });
  console.log(`TorqueCode ${config.mode}: ${address}; runner=${runner.runner}; available=${runner.available}`);
} catch {
  if (pool) await pool.end();
  console.error('Backend failed to start; check configuration, migrations and local dependencies.');
  process.exitCode = 1;
}
