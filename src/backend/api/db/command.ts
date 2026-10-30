import { createPool } from './pool.js';
import { migrate } from './migrate.js';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const pool = createPool(url);
try { await migrate(pool); console.log('Database migrations applied'); }
catch { console.error('Database migration failed; check the target database and configuration'); process.exitCode = 1; }
finally { await pool.end(); }
