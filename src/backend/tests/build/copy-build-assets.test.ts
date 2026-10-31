import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = new URL('../../tools/copy-build-assets.mjs', import.meta.url);
const load = async (): Promise<{ copyBuildAssets: (root: string, out?: string) => string[] }> => import(script.href);
const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function fakeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'tc-build-'));
  roots.push(root);
  const put = (path: string, text = path) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  put('api/db/migrations/001_auth.sql'); put('api/db/migrations/002_assessments.sql'); put('api/db/migrations/notes.md');
  put('intake/quiz-bank.json'); put('intake/portfolio.ts');
  put('tools/topic_scan.py'); put('tools/copy-build-assets.mjs'); put('tools/nested/deep.py');
  return root;
}

describe('build asset copy (cross-platform)', () => {
  it('copies exactly the top-level .sql, .json and .py assets, creating dist folders', async () => {
    const root = fakeRoot();
    const copied = (await load()).copyBuildAssets(root);
    expect(copied.sort()).toEqual(['api/db/migrations/001_auth.sql', 'api/db/migrations/002_assessments.sql', 'intake/quiz-bank.json', 'tools/topic_scan.py']);
    expect(readFileSync(join(root, 'dist/api/db/migrations/002_assessments.sql'), 'utf8')).toBe('api/db/migrations/002_assessments.sql');
    for (const skipped of ['api/db/migrations/notes.md', 'intake/portfolio.ts', 'tools/copy-build-assets.mjs', 'tools/nested/deep.py'])
      expect(existsSync(join(root, 'dist', skipped)), skipped).toBe(false);
  });

  it('is idempotent (rebuild over an existing dist/)', async () => {
    const root = fakeRoot();
    const { copyBuildAssets } = await load();
    copyBuildAssets(root);
    expect(copyBuildAssets(root)).toHaveLength(4);
  });

  it('runs as the build step from the package root (CLI entry)', async () => {
    const root = fakeRoot();
    const { spawnSync } = await import('node:child_process');
    const run = spawnSync(process.execPath, [fileURLToPath(script)], { cwd: root, encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('Copied 4 build assets');
    expect(existsSync(join(root, 'dist/tools/topic_scan.py'))).toBe(true);
  });

  it('the package build script uses no POSIX-only commands', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts.build).toBe('tsc -p tsconfig.json && node tools/copy-build-assets.mjs');
  });
});
