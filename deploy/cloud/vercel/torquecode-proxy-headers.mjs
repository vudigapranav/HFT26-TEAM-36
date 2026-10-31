// Request headers sent from Vercel to the TorqueCode backend (Caddy) for /api/* requests.
// Pure function so it can be tested without Vercel; used by middleware.ts.
//
// - Every client-supplied forwarding/identity header is dropped: the client never controls
//   the IP the backend sees, nor the proxy secret.
// - The client IP comes only from Vercel's platform helper ipAddress(request) (which reads
//   x-real-ip; Vercel overwrites X-Forwarded-For/X-Real-Ip at its edge to prevent spoofing).
// - The shared secret proves to Caddy that the request came through Vercel.
const UNTRUSTED = [
  'forwarded', 'x-forwarded-for', 'x-real-ip', 'x-client-ip', 'true-client-ip', 'cf-connecting-ip',
  'x-cluster-client-ip', 'fastly-client-ip', 'x-original-forwarded-for', 'x-torquecode-proxy',
];
const IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]{2,39}(?:%[\w.]+)?)$/i;

/**
 * @param {Headers} incoming  the browser request's headers
 * @param {{ secret: string | undefined, clientIp: string | undefined }} trusted  values from Vercel only
 * @returns {{ ok: true, headers: Headers } | { ok: false, status: number, reason: string }}
 */
export function proxyHeaders(incoming, { secret, clientIp }) {
  if (!secret || secret.length < 32) return { ok: false, status: 500, reason: 'proxy secret not configured' };
  const ip = (clientIp ?? '').trim();
  if (!IP.test(ip)) return { ok: false, status: 400, reason: 'client IP unavailable' };
  const headers = new Headers(incoming);
  for (const name of UNTRUSTED) headers.delete(name);
  headers.set('x-real-ip', ip);
  headers.set('x-forwarded-for', ip);
  headers.set('x-torquecode-proxy', secret);
  return { ok: true, headers };
}
