// For Akshit: copy this file and torquecode-proxy-headers.mjs to src/frontend/ (project root,
// next to package.json), `pnpm add @vercel/functions`, and set TORQUECODE_PROXY_SECRET in the
// Vercel project (Production). Runs only for /api/*; vercel.json then rewrites to the VM.
import { ipAddress, next } from '@vercel/functions';
import { proxyHeaders } from './torquecode-proxy-headers.mjs';

export const config = { matcher: '/api/:path*' };

export default function middleware(request: Request) {
  const result = proxyHeaders(request.headers, {
    secret: process.env.TORQUECODE_PROXY_SECRET,
    clientIp: ipAddress(request), // Vercel's platform-provided client IP, never a client header
  });
  if (!result.ok) {
    // Fail closed: without the secret Caddy would 403 anyway; without an IP, don't guess one.
    return new Response(JSON.stringify({ error: { code: 'PROXY_UNAVAILABLE', message: 'Service unavailable' } }),
      { status: result.status === 400 ? 400 : 503, headers: { 'content-type': 'application/json' } });
  }
  return next({ request: { headers: result.headers } });
}
