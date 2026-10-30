import { checkRunner } from './runner-status.js';
import { buildApp } from './app.js';
import { createDevPorts } from './dev-stubs.js';
import { readConfig } from './config.js';
import { readAuthUser } from './auth.js';
import { AssessmentStore } from './assessment-store.js';
import { createWiredPorts } from './wiring.js';
import { loadSeed } from '../runner/local/seed-runner.js';
import { createPool } from './db/pool.js';

const config = readConfig();
const pool = config.mode === 'auth' ? createPool(config.database_url) : undefined;
try {
  const runner = await checkRunner();
  const auth = pool && config.mode === 'auth' ? { pool, origin: config.auth_origin, secure: config.secure_cookies } : undefined;
  const seed = auth ? await loadSeed() : undefined;
  const app = await buildApp({ runner, ports: seed ? createWiredPorts(seed) : createDevPorts(), ...(auth && seed ? {
    auth, assessment: { store: new AssessmentStore(), seed, origin: auth.origin, runner_status: runner,
      authenticate: async request => (await readAuthUser(request, auth))?.user_id },
  } : {}) });
  try { await app.ready(); console.log(JSON.stringify(app.swagger(), null, 2)); }
  finally { await app.close(); }
} finally { if (pool) await pool.end(); }
