// Every seed task must keep its declared behaviour through the R3 split-container runner:
// reference passes everything (3 runs, no flakiness); starter fails exactly f2p_ids and passes p2p_ids.
// New seeds (K7) and generated tasks (K6) are covered automatically. Real Docker; skips without it.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { File, Limits, TestFile } from '../../contracts/internal.js';
import { createDockerRunner } from '../../runner/dockerRunner.js';

const IMAGE = 'torquecode-runner-python:dev';
const dockerReady = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore', timeout: 15_000 }).status === 0;
const runTests = createDockerRunner({ image: IMAGE });
const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const seeds = readdirSync('seed_bank', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);

describe.skipIf(!dockerReady)('seed bank through the isolated runner (real Docker)', () => {
  it('finds the seed tasks', () => expect(seeds.length).toBeGreaterThanOrEqual(1));

  it.each(seeds)('%s: reference passes all tests 3 times; starter fails exactly F2P and passes P2P', async seed => {
    const root = join('seed_bank', seed);
    const task = JSON.parse(read(join(root, 'task.json'))) as { task_id: string; limits: Limits; f2p_ids: string[]; p2p_ids: string[] };
    const files = (dir: string): File[] => readdirSync(join(root, dir, 'app')).map(name => ({ path: `app/${name}`, content: read(join(root, dir, 'app', name)), editable: true }));
    const testFile = (path: string, visibility: TestFile['visibility']): TestFile => {
      const content = read(join(root, path));
      return { path, content, visibility, ids: [...content.matchAll(/^def (test_\w+)/gm)].map(m => `${path}::${m[1]}`) };
    };
    const tests = [testFile('tests/test_visible.py', 'visible'), testFile('tests/test_hidden.py', 'hidden')];
    const run = (dir: string) => runTests({ task_id: task.task_id, files: files(dir), tests, mode: 'submit', limits: task.limits }, { signal: AbortSignal.timeout(120_000) });
    for (let attempt = 0; attempt < 3; attempt++) {
      const reference = await run('reference');
      if (reference.kind !== 'ok') throw new Error(`reference: ${reference.kind}`);
      expect(reference.value.tests.filter(t => t.status !== 'pass').map(t => `${t.id}=${t.status}`)).toEqual([]);
    }
    const starter = await run('starter');
    if (starter.kind !== 'ok') throw new Error(`starter: ${starter.kind}`);
    const status = Object.fromEntries(starter.value.tests.map(t => [t.id, t.status]));
    expect(task.f2p_ids.filter(id => status[id] !== 'fail')).toEqual([]);
    expect(task.p2p_ids.filter(id => status[id] !== 'pass')).toEqual([]);
  }, 180_000);
});
