import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { buildApp } from '../../api/app.js';
import { createDevPorts } from '../../api/dev-stubs.js';
import { migrate } from '../../api/db/migrate.js';
import { readConfig } from '../../api/config.js';

// Run through pnpm test:auth: it creates and destroys a dedicated PostgreSQL cluster.
const enabled = process.env.TORQUECODE_ISOLATED_TEST_DB === '1';
describe.skipIf(!enabled)('K2 with real isolated PostgreSQL', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const origin = 'http://127.0.0.1:3001';
  let app: Awaited<ReturnType<typeof buildApp>>;
  const credentials = { email: 'candidate@example.org', password: 'correct horse battery staple' };
  const post = (url: string, payload: Record<string, unknown> = credentials, cookie?: string, requestOrigin = origin, remoteAddress = '127.0.0.1') => app.inject({
    method: 'POST', url, remoteAddress, headers: { origin: requestOrigin, ...(cookie ? { cookie } : {}) }, payload,
  });
  const cookieFrom = (response: { headers: Record<string, unknown> }) => String(response.headers['set-cookie']).split(';')[0]!;
  beforeAll(async () => {
    await migrate(pool);
    await migrate(pool); // repeatable without losing users or schema
    app = await buildApp({ ports: createDevPorts(), auth: { pool, origin, secure: false } });
  });
  beforeEach(async () => { await pool.query('TRUNCATE auth_sessions, auth_users, auth_rate_limits CASCADE'); });
  afterAll(async () => { await app?.close(); await pool.end(); });

  it('registers, logs in, reads only its own public user, and revokes logout', async () => {
    const registered = await post('/auth/register');
    expect(registered.statusCode).toBe(201);
    expect(registered.json()).toEqual({ user: { user_id: expect.any(String), email: credentials.email } });
    expect(registered.headers['cache-control']).toBe('no-store');
    expect(registered.headers['set-cookie']).toBeUndefined();
    expect((await app.inject('/auth/me')).statusCode).toBe(401);
    const login = await post('/auth/login');
    expect(login.statusCode).toBe(200);
    const cookie = cookieFrom(login);
    expect(login.headers['set-cookie']).toContain('HttpOnly');
    expect(login.headers['set-cookie']).toContain('SameSite=Strict');
    expect(login.headers['set-cookie']).toContain('Max-Age=');
    const token = cookie.split('=')[1]!;
    const stored = await pool.query('SELECT token_hash, expires_at FROM auth_sessions');
    expect(stored.rows[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(stored.rows[0].token_hash).not.toBe(token);
    const users = await pool.query('SELECT password_hash FROM auth_users');
    expect(users.rows[0].password_hash).toMatch(/^\$argon2id\$/);
    const me = await app.inject({ url: '/auth/me', headers: { cookie } });
    expect(me.json()).toEqual(registered.json());
    await post('/auth/register', { ...credentials, email: 'other@example.org' });
    const otherCookie = cookieFrom(await post('/auth/login', { ...credentials, email: 'other@example.org' }));
    const other = await app.inject({ url: '/auth/me?user_id=' + registered.json().user.user_id, headers: { cookie: otherCookie } });
    expect(other.json().user.email).toBe('other@example.org');
    expect(me.body).not.toContain(token);
    expect(me.body).not.toContain('password');
    expect((await post('/auth/logout', {}, cookie)).statusCode).toBe(204);
    expect((await app.inject({ url: '/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('uses database uniqueness for concurrent normalized registrations', async () => {
    const responses = await Promise.all([post('/auth/register'), post('/auth/register', { ...credentials, email: 'CANDIDATE@example.org' })]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([201, 409]);
    expect(Number((await pool.query('SELECT count(*) FROM auth_users')).rows[0].count)).toBe(1);
  });

  it('rejects wrong passwords and unknown users with the same public error', async () => {
    await post('/auth/register');
    for (const data of [{ ...credentials, password: 'wrong password' }, { ...credentials, email: "nobody'OR'1'='1@example.org" }]) {
      const result = await post('/auth/login', data);
      expect(result.statusCode).toBe(401);
      expect(result.json().error.code).toBe('INVALID_CREDENTIALS');
      expect(result.headers['set-cookie']).toBeUndefined();
    }
  });

  it('blocks foreign, missing, and null origins before cookie state changes', async () => {
    for (const path of ['/auth/register', '/auth/login', '/auth/logout']) {
      for (const badOrigin of ['https://evil.example', 'null']) expect((await post(path, credentials, undefined, badOrigin)).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: path, payload: credentials })).statusCode).toBe(403);
    }
    expect(Number((await pool.query('SELECT count(*) FROM auth_users')).rows[0].count)).toBe(0);
  });

  it('rejects oversized, unknown and invalid input without reflecting credentials', async () => {
    for (const payload of [{ ...credentials, password_hash: 'SECRET_MARKER' }, { ...credentials, password: 'x' }, { ...credentials, password: 'x'.repeat(129) }, { ...credentials, email: 'invalid' }]) {
      const result = await post('/auth/register', payload);
      expect(result.statusCode).toBe(400);
      expect(result.body).not.toContain('SECRET_MARKER');
      expect(result.body).not.toContain(credentials.password);
    }
    expect((await post('/auth/register', { ...credentials, password: 'x'.repeat(5000) })).statusCode).toBe(413);
  });

  it('rejects expired, forged and malformed sessions', async () => {
    await post('/auth/register');
    const cookie = cookieFrom(await post('/auth/login'));
    await pool.query("UPDATE auth_sessions SET expires_at = now() - interval '1 second'");
    for (const value of [cookie, 'tc_session=' + 'a'.repeat(43), 'tc_session=garbage']) {
      expect((await app.inject({ url: '/auth/me', headers: { cookie: value } })).statusCode).toBe(401);
    }
  });

  it('issues distinct sessions and logout revokes only the presented session', async () => {
    await post('/auth/register');
    const first = cookieFrom(await post('/auth/login'));
    const second = cookieFrom(await post('/auth/login'));
    expect(first).not.toBe(second);
    await post('/auth/logout', {}, first);
    expect((await app.inject({ url: '/auth/me', headers: { cookie: first } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/auth/me', headers: { cookie: second } })).statusCode).toBe(200);
  });

  it('bounds account attempts across IPs and IP attempts across accounts', async () => {
    for (let i = 0; i < 10; i++) await post('/auth/login', credentials, undefined, origin, `192.0.2.${i + 1}`);
    expect((await post('/auth/login')).statusCode).toBe(429);
    await pool.query("UPDATE auth_rate_limits SET expires_at = now() - interval '1 second'");
    for (let i = 0; i < 20; i++) await post('/auth/login', { ...credentials, email: `nobody${i}@example.org` });
    const limited = await post('/auth/login', { ...credentials, email: 'another@example.org' });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('sets production cookie attributes and rejects unsafe configuration', async () => {
    const secureApp = await buildApp({ ports: createDevPorts(), auth: { pool, origin: 'https://torque.example', secure: true } });
    try {
      await post('/auth/register');
      const login = await secureApp.inject({ method: 'POST', url: '/auth/login', headers: { origin: 'https://torque.example' }, payload: credentials });
      expect(login.headers['set-cookie']).toContain('__Host-tc_session=');
      expect(login.headers['set-cookie']).toContain('Secure');
      expect(login.headers['set-cookie']).not.toContain('Domain=');
    } finally { await secureApp.close(); }
    for (const env of [{ APP_MODE: 'auth' }, { APP_MODE: 'auth', DATABASE_URL: 'postgres://localhost/test', AUTH_ORIGIN: 'http://evil.example' }, { APP_MODE: 'auth', DATABASE_URL: 'postgres://localhost/test', AUTH_ORIGIN: origin, NODE_ENV: 'production' }]) expect(() => readConfig(env)).toThrow();
  });
});
