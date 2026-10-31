// Fresh cluster only. An unavailable PostgreSQL installation/runtime skips integration tests.
// Migration/assertion failures after startup still fail. CI can require the DB with TORQUECODE_REQUIRE_DB=1.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join('/tmp', 'tc-auth-'));
const data = join(dir, 'data');
const socket = join(dir, 'socket');
mkdirSync(socket, { mode: 0o700 });
let started = false;
let pgBin;
let child;
let dockerName;
const dockerEnv = { ...process.env, ...(process.platform === 'darwin' && !process.env.DOCKER_CONTEXT ? { DOCKER_CONTEXT: 'desktop-linux' } : {}) };
const docker = (...args) => execFileSync('docker', args, { env: dockerEnv, encoding: 'utf8', timeout: 30000, stdio: ['ignore','pipe','pipe'] }).trim();
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
    // Docker is an isolated fallback when native initdb is unavailable (e.g. shmget sandbox restriction).
    try {
      docker('image', 'inspect', 'postgres:16');
      dockerName = `torquecode-test-${randomUUID()}`;
      docker('run', '-d', '--name', dockerName, '--label', 'torquecode.isolated-test=1', '-e', 'POSTGRES_USER=torquecode_test', '-e', 'POSTGRES_DB=postgres', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'postgres:16');
      let ready = false;
      for (let i = 0; i < 60; i++) {
        try { docker('exec', dockerName, 'pg_isready', '-U', 'torquecode_test'); ready = true; break; }
        catch { await new Promise(resolve => setTimeout(resolve, 500)); }
      }
      if (!ready) throw new Error('Isolated Docker PostgreSQL did not become ready');
      const binding = docker('port', dockerName, '5432/tcp');
      const port = /^127\.0\.0\.1:(\d+)$/.exec(binding)?.[1];
      if (!port) throw new Error('Unexpected test PostgreSQL binding');
      databaseUrl = `postgresql://torquecode_test@127.0.0.1:${port}/postgres`;
      console.log('Real isolated PostgreSQL running in dedicated Docker container.');
    } catch (dockerError) {
      if (process.env.TORQUECODE_REQUIRE_DB === '1') throw dockerError;
      console.warn('SKIP PostgreSQL integration: native and Docker PostgreSQL unavailable. No database tests are counted as passed.');
      if (error instanceof Error) console.warn(error.message);
      if (dockerError instanceof Error) console.warn(dockerError.message);
    }
  }
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.TORQUECODE_ISOLATED_TEST_DB;
  if (databaseUrl) Object.assign(env, { DATABASE_URL: databaseUrl, TORQUECODE_ISOLATED_TEST_DB: '1' });
  child = spawn('pnpm', ['--filter', '@torquecode/backend', 'exec', 'vitest', 'run', ...(process.env.TORQUECODE_ALL_DB_TESTS === '1' ? [] : process.argv.includes('--persistence') ? ['tests/persistence'] : ['tests/auth/auth.integration.test.ts', 'tests/persistence'])], { cwd: root, stdio: 'inherit', env });
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Isolated PostgreSQL test failed');
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  if (dockerName) docker('rm', '-f', '-v', dockerName);
  if (started) execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(dir, { recursive: true });
}
