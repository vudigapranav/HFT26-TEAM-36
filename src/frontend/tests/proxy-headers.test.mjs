// Copied from deploy/cloud/vercel (Rithvik, R6b); runs with the frontend's node tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proxyHeaders } from '../torquecode-proxy-headers.mjs';

const SECRET = 'a'.repeat(64);
const spoofed = () => new Headers({
  'x-forwarded-for': '6.6.6.6, 10.0.0.1', 'x-real-ip': '6.6.6.6', forwarded: 'for=6.6.6.6', 'true-client-ip': '6.6.6.6',
  'cf-connecting-ip': '6.6.6.6', 'x-client-ip': '6.6.6.6', 'x-torquecode-proxy': 'client-guess',
  cookie: '__Host-tc_session=abc', origin: 'https://app.example.com', 'content-type': 'application/json',
});

test('uses the platform IP and overwrites every client-supplied forwarding header', () => {
  const result = proxyHeaders(spoofed(), { secret: SECRET, clientIp: '203.0.113.9' });
  assert.equal(result.ok, true);
  const h = result.headers;
  assert.equal(h.get('x-real-ip'), '203.0.113.9');
  assert.equal(h.get('x-forwarded-for'), '203.0.113.9'); // not appended to the spoofed chain
  assert.equal(h.get('x-torquecode-proxy'), SECRET);     // the client's guess is replaced
  for (const name of ['forwarded', 'true-client-ip', 'cf-connecting-ip', 'x-client-ip']) assert.equal(h.get(name), null, name);
  assert.doesNotMatch([...h.values()].join(' '), /6\.6\.6\.6|client-guess/);
});

test('keeps the headers the backend needs: cookie, origin, content type', () => {
  const { headers } = proxyHeaders(spoofed(), { secret: SECRET, clientIp: '2001:db8::1' });
  assert.equal(headers.get('cookie'), '__Host-tc_session=abc');
  assert.equal(headers.get('origin'), 'https://app.example.com');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('x-real-ip'), '2001:db8::1');
});

test('fails closed without a secret or a usable platform IP', () => {
  assert.deepEqual(proxyHeaders(spoofed(), { secret: undefined, clientIp: '203.0.113.9' }), { ok: false, status: 500, reason: 'proxy secret not configured' });
  assert.deepEqual(proxyHeaders(spoofed(), { secret: 'short', clientIp: '203.0.113.9' }).ok, false);
  for (const ip of [undefined, '', 'unknown', '6.6.6.6, 1.2.3.4', '<script>']) {
    assert.equal(proxyHeaders(spoofed(), { secret: SECRET, clientIp: ip }).ok, false, String(ip));
  }
});

test('does not mutate the incoming headers', () => {
  const incoming = spoofed();
  proxyHeaders(incoming, { secret: SECRET, clientIp: '203.0.113.9' });
  assert.equal(incoming.get('x-real-ip'), '6.6.6.6');
});
