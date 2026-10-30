import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

// SQL is a reviewed artifact copied alongside compiled code by the build command.
export async function migrate(pool: Pool): Promise<void> {
  const sql = await readFile(new URL('./migrations/001_auth.sql', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(8432062)");
    await client.query('CREATE TABLE IF NOT EXISTS backend_migrations (version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const existing = await client.query('SELECT checksum FROM backend_migrations WHERE version = $1', [1]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error('Applied migration checksum differs');
    } else {
      await client.query(sql);
      await client.query('INSERT INTO backend_migrations (version, checksum) VALUES ($1, $2)', [1, checksum]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
