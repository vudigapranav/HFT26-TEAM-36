// Fresh cluster only. An unavailable PostgreSQL installation/runtime skips integration tests.
// Migration/assertion failures after startup still fail. CI can require the DB with TORQUECODE_REQUIRE_DB=1.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join('/tmp', 'tc-auth-'));
const data = join(dir, 'data');
const socket = join(dir, 'socket');
mkdirSync(socket, { mode: 0o700 });
let started = false;
let pgBin;
let child;
const stop = () => { if (child) child.kill('SIGTERM'); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  let databaseUrl;
  try {
    pgBin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
    execFileSync(join(pgBin, 'initdb'), ['-D', data, '-U', 'torquecode_test', '--auth-local=trust', '--auth-host=reject', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
    execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${socket} -h '' -c max_connections=15`, '-w', 'start'], { stdio: 'pipe' });
    started = true;
    const db = new URL('postgresql://torquecode_test@localhost/postgres');
    db.searchParams.set('host', socket);
    databaseUrl = db.toString();
  } catch (error) {
    if (process.env.TORQUECODE_REQUIRE_DB === '1') throw error;
    console.warn('SKIP PostgreSQL integration: isolated PostgreSQL could not start. No database tests are counted as passed.');
    if (error instanceof Error) console.warn(error.message);
  }
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.TORQUECODE_ISOLATED_TEST_DB;
  if (databaseUrl) Object.assign(env, { DATABASE_URL: databaseUrl, TORQUECODE_ISOLATED_TEST_DB: '1' });
  child = spawn('pnpm', ['--filter', '@torquecode/backend', 'exec', 'vitest', 'run', ...(process.env.TORQUECODE_ALL_DB_TESTS === '1' ? [] : ['tests/auth/auth.integration.test.ts'])], { cwd: root, stdio: 'inherit', env });
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Isolated PostgreSQL test failed');
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  if (started) execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(dir, { recursive: true });
}
