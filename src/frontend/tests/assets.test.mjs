import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = dir => readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = [...walk(join(root, 'src')), ...walk(join(root, 'public'))].filter(f => /\.(html|tsx?|mjs|js|css|md)$/.test(f));

test('every designs/ reference points to a file that exists (G7)', () => {
  const missing = [];
  for (const file of files) {
    for (const [, ref] of readFileSync(file, 'utf8').matchAll(/["'(]((?:\.\.\/|\/)?designs\/[\w.-]+\.png)/g)) {
      const target = ref.startsWith('/') ? join(root, 'public', ref) : file.includes('/public/') ? resolve(dirname(file), ref) : join(root, 'public', ref);
      if (!existsSync(target)) missing.push(`${file.slice(root.length)} → ${ref}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the landing page and the start screen use illustrations that exist', () => {
  for (const ref of ['assessment.svg', 'report.svg']) assert.ok(existsSync(join(root, 'public/landing/assets', ref)));
  assert.match(readFileSync(join(root, 'src/pages/Ready.tsx'), 'utf8'), /\/landing\/assets\/assessment\.svg/);
});
