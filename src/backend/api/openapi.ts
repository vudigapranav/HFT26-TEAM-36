import { buildApp } from './app.js';
import { createDevPorts } from './dev-stubs.js';
import { readConfig } from './config.js';
import { createPool } from './db/pool.js';

const config = readConfig();
const pool = config.mode === 'auth' ? createPool(config.database_url) : undefined;
try {
  const app = await buildApp({ ports: createDevPorts(), ...(pool && config.mode === 'auth' ? {
    auth: { pool, origin: config.auth_origin, secure: config.secure_cookies },
  } : {}) });
  try { await app.ready(); console.log(JSON.stringify(app.swagger(), null, 2)); }
  finally { await app.close(); }
} finally { if (pool) await pool.end(); }
