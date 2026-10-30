import { Pool } from 'pg';
export function createPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000, statement_timeout: 5000, query_timeout: 6000 });
  // Idle connection failures must not crash Node or log connection credentials.
  pool.on('error', () => { console.error('Database connection unavailable'); });
  return pool;
}
