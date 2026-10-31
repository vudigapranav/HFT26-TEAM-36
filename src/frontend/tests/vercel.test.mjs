import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('..', import.meta.url);
const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));

test('vercel.json proxies /api same-origin to the backend and keeps static files', () => {
  const [api, spa] = config.rewrites;
  assert.equal(api.source, '/api/:path*');
  // Locked deployment decision: the browser only talks to the Vercel origin; /api is rewritten, the prefix stripped.
  assert.match(api.destination, /^https:\/\/[^/]+\/:path\*$/);
  assert.equal(spa.destination, '/index.html');
  for (const path of ['api/health', 'assets/index.js', 'landing/index.html', 'designs/02-create-account.png']) {
    assert.doesNotMatch(path, new RegExp(`^${spa.source.slice(1)}$`.replace('^(', '^(?:')), path);
  }
  assert.equal(config.outputDirectory, 'dist');
  assert.match(config.installCommand, /--frozen-lockfile/);
});

test('the middleware only runs for /api and adds the proxy secret from the server environment', () => {
  const middleware = readFileSync(new URL('middleware.ts', root), 'utf8');
  assert.match(middleware, /matcher: '\/api\/:path\*'/);
  assert.match(middleware, /process\.env\.TORQUECODE_PROXY_SECRET/);
  assert.match(middleware, /ipAddress\(request\)/);
});
