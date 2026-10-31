// Vercel Routing Middleware (from deploy/cloud/vercel, R6b). Runs only for /api/*; vercel.json then rewrites the
// request to the backend VM. Needs TORQUECODE_PROXY_SECRET in the Vercel project (Production), the same value as
// PROXY_SECRET on the VM (Caddy refuses requests without it).
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
