import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../../api/app.js';
import { createDevPorts } from '../../api/dev-stubs.js';
import { readConfig } from '../../api/config.js';

// Real pool, never contacted: these HTTP checks must reject before any database access.
describe('K2 HTTP boundary without database access', () => {
  const pool = new Pool({ host: '/nonexistent-torquecode-test-socket', connectionTimeoutMillis: 100 });
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { app = await buildApp({ ports: createDevPorts(), auth: { pool, origin: 'http://localhost:3001', secure: false } }); });
  afterAll(async () => { await app?.close(); await pool.end(); });
  it('advertises only implemented auth and health routes', async () => {
    await app.ready();
    expect(Object.keys(app.swagger().paths ?? {}).sort()).toEqual(['/auth/login', '/auth/logout', '/auth/me', '/auth/register', '/health']);
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok', mode: 'auth', candidate_execution: false });
  });
  it('blocks missing and foreign origins before body parsing or SQL', async () => {
    for (const origin of [undefined, 'null', 'https://evil.example', 'http://localhost:3001.evil.example']) {
      const result = await app.inject({ method: 'POST', url: '/auth/register', headers: { ...(origin ? { origin } : {}), 'content-type': 'application/json' }, payload: '{' });
      expect(result.statusCode).toBe(403);
      expect(result.headers['cache-control']).toBe('no-store');
    }
  });
  it('rejects malformed and excessive credentials before SQL', async () => {
    for (const payload of [{ email: 'test@example.org', password: 'short' }, { email: 'test@example.org', password: 'x'.repeat(129) }, { email: 'bad', password: 'a long password' }, { email: 'test@example.org', password: 'a long password', admin: true }]) {
      expect((await app.inject({ method: 'POST', url: '/auth/register', headers: { origin: 'http://localhost:3001' }, payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'POST', url: '/auth/login', headers: { origin: 'http://localhost:3001' }, payload: { email: 'test@example.org', password: 'x'.repeat(5000) } })).statusCode).toBe(413);
  });
  it('rejects absent and malformed cookies without a database query', async () => {
    expect((await app.inject('/auth/me')).statusCode).toBe(401);
    expect((await app.inject({ url: '/auth/me', headers: { cookie: 'tc_session=invalid' } })).statusCode).toBe(401);
    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: { origin: 'http://localhost:3001' } });
    expect(logout.statusCode).toBe(204);
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
  });
  it('requires explicit, safe auth settings', () => {
    const database = 'postgresql://localhost/torquecode';
    const valid = { APP_MODE: 'auth', DATABASE_URL: database, AUTH_ORIGIN: 'https://torque.example', NODE_ENV: 'production' };
    expect(readConfig(valid)).toMatchObject({ mode: 'auth', secure_cookies: true });
    for (const env of [{ APP_MODE: 'auth' }, { ...valid, AUTH_ORIGIN: 'http://torque.example' }, { ...valid, AUTH_ORIGIN: 'http://localhost:3001' }, { ...valid, AUTH_ORIGIN: 'https://torque.example/path' }, { ...valid, DATABASE_URL: 'sqlite:local' }]) expect(() => readConfig(env)).toThrow();
  });
});
