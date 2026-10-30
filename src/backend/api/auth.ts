import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash, verify, argon2id } from 'argon2';
import cookie from '@fastify/cookie';
import type { Pool } from 'pg';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiError, AuthCredentials, AuthUserResponse, type AuthUser } from '@torquecode/contracts';

export type AuthOptions = { pool: Pool; origin: string; secure: boolean };
const TTL_SECONDS = 7 * 24 * 60 * 60;
const HASH_OPTIONS = { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const failure = (request: FastifyRequest, reply: FastifyReply, status: number, code: string) =>
  reply.code(status).send({ error: { code, message: 'Request rejected', request_id: request.id } });

export async function registerAuth(app: FastifyInstance, options: AuthOptions): Promise<void> {
  const { pool, origin, secure } = options;
  const parsed = new URL(origin);
  if (parsed.origin !== origin || (secure ? parsed.protocol !== 'https:' : parsed.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(parsed.hostname))) throw new Error('Unsafe auth origin');
  const cookieName = secure ? '__Host-tc_session' : 'tc_session';
  const cookieOptions = { path: '/', httpOnly: true, secure, sameSite: 'lax' as const };
  // Equal-cost missing-account verification. No queue: bound simultaneous expensive work.
  const dummyHash = await hash(randomBytes(32), HASH_OPTIONS);
  let activeHashes = 0;
  await app.register(cookie);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin !== origin) {
      return failure(request, reply, 403, 'ORIGIN_REJECTED');
    }
  });
  async function limited(request: FastifyRequest, reply: FastifyReply, email: string) {
    // Persistent atomic counters shared by API instances; no trust in X-Forwarded-For.
    await pool.query('DELETE FROM auth_rate_limits WHERE expires_at <= now()');
    for (const [key, limit] of [[`ip:${request.ip}`, 20], [`account:${email}`, 10]] as const) {
      const result = await pool.query(`INSERT INTO auth_rate_limits (key, attempts, expires_at)
        VALUES ($1, 1, now() + interval '15 minutes')
        ON CONFLICT (key) DO UPDATE SET attempts = auth_rate_limits.attempts + 1
        RETURNING attempts, GREATEST(1, ceil(extract(epoch FROM (expires_at - now()))))::int AS retry_after`, [digest(key)]);
      if (result.rows[0].attempts > limit) {
        reply.header('Retry-After', String(result.rows[0].retry_after));
        failure(request, reply, 429, 'RATE_LIMITED');
        return false;
      }
    }
    if (activeHashes >= 2) {
      reply.header('Retry-After', '1');
      failure(request, reply, 429, 'AUTH_BUSY');
      return false;
    }
    activeHashes++;
    return true;
  }
  const responses = { 400: ApiError, 401: ApiError, 403: ApiError, 409: ApiError, 413: ApiError, 429: ApiError, 500: ApiError };
  for (const operation of ['register', 'login'] as const) {
    app.post<{ Body: { email: string; password: string } }>(`/auth/${operation}`, {
      bodyLimit: 2048, schema: { body: AuthCredentials, response: { ...responses, [operation === 'register' ? 201 : 200]: AuthUserResponse } },
    }, async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      if (!await limited(request, reply, email)) return;
      try {
        if (operation === 'register') {
          const passwordHash = await hash(request.body.password, HASH_OPTIONS);
          const created = await pool.query(`INSERT INTO auth_users (user_id, email, password_hash) VALUES ($1, $2, $3)
            ON CONFLICT (email) DO NOTHING RETURNING user_id, email`, [randomUUID(), email, passwordHash]);
          if (!created.rowCount) return failure(request, reply, 409, 'ACCOUNT_EXISTS');
          return reply.code(201).send({ user: created.rows[0] });
        }
        const found = await pool.query('SELECT user_id, email, password_hash FROM auth_users WHERE email = $1', [email]);
        const user = found.rows[0];
        const valid = await verify(user?.password_hash ?? dummyHash, request.body.password);
        if (!valid || !user) return failure(request, reply, 401, 'INVALID_CREDENTIALS');
        const token = randomBytes(32).toString('base64url');
        // Housekeeping uses the same expiry predicate as authorization; no expired session is accepted.
        await pool.query('DELETE FROM auth_sessions WHERE expires_at <= now()');
        await pool.query("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3 * interval '1 second')", [digest(token), user.user_id, TTL_SECONDS]);
        reply.setCookie(cookieName, token, { ...cookieOptions, maxAge: TTL_SECONDS, expires: new Date(Date.now() + TTL_SECONDS * 1000) });
        return { user: { user_id: user.user_id, email: user.email } };
      } finally { activeHashes--; }
    });
  }
  const sessionHash = (request: FastifyRequest) => {
    const token = request.cookies[cookieName];
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? digest(token) : undefined;
  };
  app.get('/auth/me', { schema: { response: { 200: AuthUserResponse, 401: ApiError, 500: ApiError } } }, async (request, reply) => {
    const user = await readAuthUser(request, options);
    if (!user) return failure(request, reply, 401, 'UNAUTHENTICATED');
    return { user };
  });
  app.post('/auth/logout', { bodyLimit: 2048, schema: { response: { 204: { type: 'null' }, 403: ApiError, 500: ApiError } } }, async (request, reply) => {
    const tokenHash = sessionHash(request);
    if (tokenHash) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
    reply.clearCookie(cookieName, cookieOptions);
    return reply.code(204).send();
  });
}


// Shared by /auth/me and assessment routes; callers cannot choose the authenticated user_id.
export async function readAuthUser(request: FastifyRequest, options: AuthOptions): Promise<AuthUser | undefined> {
  const token = request.cookies[options.secure ? '__Host-tc_session' : 'tc_session'];
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const result = await options.pool.query(`SELECT u.user_id, u.email FROM auth_sessions s JOIN auth_users u ON s.user_id = u.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now()`, [digest(token)]);
  return result.rowCount ? { user_id: result.rows[0].user_id, email: result.rows[0].email } : undefined;
}
