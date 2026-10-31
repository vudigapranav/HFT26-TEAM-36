export type Config = { host: string; port: number; mode: 'skeleton' } | {
  host: string; port: number; mode: 'auth'; database_url: string; auth_origin: string; secure_cookies: boolean; trust_proxy?: boolean;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? '3001');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer between 1 and 65535');
  const host = env.HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('Backend must bind to loopback until deployment integration');
  if (env.TRUST_PROXY !== undefined && !['true','false',''].includes(env.TRUST_PROXY)) throw new Error('TRUST_PROXY must be true or false');
  const mode = env.APP_MODE ?? 'skeleton';
  if (mode === 'skeleton') return { host, port, mode };
  if (mode !== 'auth') throw new Error('Unsupported APP_MODE');
  if (!env.DATABASE_URL || !env.AUTH_ORIGIN) throw new Error('Auth requires DATABASE_URL and AUTH_ORIGIN');
  const origin = new URL(env.AUTH_ORIGIN);
  const secure = origin.protocol === 'https:';
  if (origin.origin !== env.AUTH_ORIGIN || (!secure && (origin.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(origin.hostname))) || (env.NODE_ENV === 'production' && !secure)) throw new Error('Unsafe AUTH_ORIGIN');
  const database = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('PostgreSQL URL required');
  return { host, port, mode, database_url: env.DATABASE_URL, auth_origin: env.AUTH_ORIGIN, secure_cookies: secure, trust_proxy: env.TRUST_PROXY === 'true' };
}
