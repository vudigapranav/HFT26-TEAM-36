import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sendOnLeave} from '../src/api.mjs';

test('integrity events queued when the page is hidden or unloaded are sent with keepalive', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({url, init}); return {ok: true, status: 204}; };
  try {
    await sendOnLeave('/assessments/a1/events', {events: [{task_id: 'question-1', client_ts: '2026-10-31T00:00:00.000Z', type: 'paste', payload: {size: 12}}]});
  } finally { globalThis.fetch = original; }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/assessments/a1/events');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.keepalive, true);
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(JSON.parse(calls[0].init.body).events[0].type, 'paste');
});

test('the workspace flushes integrity events on tab hide and pagehide, not only every 10 s', () => {
  const workspace = readFileSync(new URL('../src/pages/Workspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /if\(document\.hidden\)flushOnLeave\(\)/);
  assert.match(workspace, /addEventListener\('pagehide',leave\)/);
  assert.match(workspace, /removeEventListener\('pagehide',leave\)/);
});
