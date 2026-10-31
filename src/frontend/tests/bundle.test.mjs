import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const src = path => readFileSync(root + path, 'utf8');

test('Monaco is only reachable through the lazily loaded CodeEditor (G9)', () => {
  const workspace = src('src/pages/Workspace.tsx');
  // Type-only imports are erased; any value import would pull the editor into the Workspace chunk.
  assert.doesNotMatch(workspace, /^import (?!type )[^\n]*from '@monaco-editor\/react'|import '\.\.\/monaco-setup'/m);
  assert.match(workspace, /lazy\(\(\)=>import\('\.\.\/components\/CodeEditor'\)\)/);
  assert.match(src('src/components/CodeEditor.tsx'), /import '\.\.\/monaco-setup'/);
});

test('the built entry neither contains nor preloads editor code (G9; runs after `pnpm build`)', {skip: !existsSync(root + 'dist/index.html') && 'no dist/ — run the build first'}, () => {
  const html = readFileSync(root + 'dist/index.html', 'utf8');
  assert.doesNotMatch(html, /modulepreload[^>]*(CodeEditor|monaco)/i);
  const assets = readdirSync(root + 'dist/assets');
  const entry = assets.find(f => /^index-.*\.js$/.test(f));
  const workspace = assets.find(f => /^Workspace-.*\.js$/.test(f));
  for (const file of [entry, workspace]) assert.doesNotMatch(readFileSync(`${root}dist/assets/${file}`, 'utf8'), /defineTheme|editor\.api/, `${file} contains editor code`);
  assert.ok(assets.some(f => /^CodeEditor-.*\.js$/.test(f)), 'the editor has its own chunk');
});
