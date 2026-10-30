export type Config = { host: string; port: number; mode: 'skeleton' };

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? '3001');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer between 1 and 65535');
  if (env.APP_MODE && env.APP_MODE !== 'skeleton') throw new Error('K1 supports APP_MODE=skeleton only');
  // Binding remotely requires a real authentication/execution implementation first.
  const host = env.HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('K1 skeleton must bind to loopback');
  return { host, port, mode: 'skeleton' };
}
