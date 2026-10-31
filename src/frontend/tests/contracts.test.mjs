import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const sources = dir => readdirSync(join(root, dir)).flatMap(name => {
  const path = join(dir, name);
  return statSync(join(root, path)).isDirectory() ? sources(path) : [path];
});

test('API types come only from the @torquecode/contracts workspace package (G2)', () => {
  assert.equal(existsSync(join(root, 'src/contracts.ts')), false, 'the stale contracts copy must stay deleted');
  assert.equal(JSON.parse(read('package.json')).dependencies['@torquecode/contracts'], 'workspace:*');
  const tsconfig = JSON.parse(read('tsconfig.json'));
  assert.equal(tsconfig.compilerOptions.paths, undefined, 'no path alias may redirect the contracts import');
  for (const file of sources('src').filter(f => /\.(ts|tsx|mjs)$/.test(f))) {
    assert.doesNotMatch(read(file), /\binterface (AssessmentState|CandidateTask|RunResult|Report|PortfolioResponse)\b/, `${file} redefines an API type`);
  }
  assert.match(read('src/types.ts'), /from '@torquecode\/contracts'/);
});
