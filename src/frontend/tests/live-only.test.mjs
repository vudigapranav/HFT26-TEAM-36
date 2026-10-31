import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config = (await import('../vite.config.ts')).default;
const demoFlag = (command, mode) => config({command, mode}).define.__DEMO_BUILD__;

test('production builds are live-only; the preview needs an explicit VITE_DEMO=1 dev server (G1)', () => {
  assert.equal(demoFlag('build', 'production'), 'false');
  assert.equal(demoFlag('serve', 'development'), 'false');
  process.env.VITE_DEMO = '1';
  try {
    assert.equal(demoFlag('serve', 'development'), 'true');
    assert.equal(demoFlag('build', 'production'), 'false', 'VITE_DEMO must not reach a production build');
  } finally { delete process.env.VITE_DEMO; }
});

test('sample data is only reachable through the build-gated preview adapter (G1)', () => {
  const api = readFileSync(new URL('../src/api.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(api, /demo-data/, 'the live client must not import sample data');
  assert.match(api, /DEMO_BUILD && getMode\(\)==='demo'/);
  const main = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(main, /demoAvailable\(\)\?<button className="mode-button"/, 'the footer mode switch is preview-only');
});
