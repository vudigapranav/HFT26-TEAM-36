import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Tier, File } from '@torquecode/contracts';
import type { PrivateTask, TestFile } from '../contracts/internal.js';
import { loadSeed } from '../runner/local/seed-runner.js';

const reviewedSeeds = [
  {
    tier: 'adept',
    directory: 'adept_event_dedupe',
    editable: ['app/store.py', 'app/service.py'],
  },
  {
    tier: 'adept',
    directory: 'adept_bucket_rollup',
    editable: ['app/rollup.py', 'app/service.py'],
  },
  {
    tier: 'master',
    directory: 'master_session_window',
    editable: ['app/window.py', 'app/report.py'],
  },
  {
    tier: 'master',
    directory: 'master_error_budget',
    editable: ['app/prefix.py', 'app/report.py'],
  },
] as const;

async function pythonFiles(
  root: string,
  prefix = '',
): Promise<string[]> {
  const entries = await readdir(join(root, prefix), {
    withFileTypes: true,
  });

  const paths = await Promise.all(entries.map(async entry => {
    const name = prefix
      ? `${prefix}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) return pythonFiles(root, name);
    return entry.isFile() && name.endsWith('.py') ? [name] : [];
  }));

  return paths.flat().sort();
}

async function loadReviewedSeed(
  root: string,
  directory: string,
  editablePaths: readonly string[],
): Promise<PrivateTask> {
  const base = join(root, 'seed_bank', directory);
  const metadata = JSON.parse(
    await readFile(join(base, 'task.json'), 'utf8'),
  ) as Omit<
    PrivateTask,
    'files' | 'reference_files' | 'tests' |
    'visible_tests' | 'hint_ladder'
  >;

  const paths = await pythonFiles(join(base, 'starter'));
  const editable = new Set(editablePaths);

  if (
    paths.length === 0 ||
    editablePaths.some(path => !paths.includes(path))
  ) {
    throw new Error(`Invalid seed file layout: ${directory}`);
  }

  const readFiles = async (folder: string): Promise<File[]> =>
    Promise.all(paths.map(async path => ({
      path,
      content: await readFile(
        join(base, folder, path),
        'utf8',
      ),
      editable: editable.has(path),
    })));

  const allIds = [...metadata.f2p_ids, ...metadata.p2p_ids];
  const testSpecs = [
    { path: 'tests/test_visible.py', visibility: 'visible' as const },
    { path: 'tests/test_hidden.py', visibility: 'hidden' as const },
  ];

  const tests: TestFile[] = await Promise.all(
    testSpecs.map(async spec => ({
      ...spec,
      content: await readFile(join(base, spec.path), 'utf8'),
      ids: allIds.filter(id =>
        id.startsWith(`${spec.path}::`),
      ),
    })),
  );

  if (
    tests.some(test => test.ids.length === 0) ||
    tests.reduce((count, test) => count + test.ids.length, 0)
      !== allIds.length ||
    new Set(allIds).size !== allIds.length
  ) {
    throw new Error(`Invalid seed test manifest: ${directory}`);
  }

  const visible = tests.find(test =>
    test.visibility === 'visible'
  )!;

  return {
    ...metadata,
    files: await readFiles('starter'),
    reference_files: await readFiles('reference'),
    tests,
    visible_tests: visible.ids.map(id => ({
      id,
      path: visible.path,
      content: visible.content,
    })),
    hint_ladder: JSON.parse(
      await readFile(join(base, 'hints.json'), 'utf8'),
    ) as string[],
  };
}

export async function loadSeedBank(
  root = process.cwd(),
): Promise<Partial<Record<Tier, PrivateTask[]>>> {
  // Preserve the pinned-digest verification for the Novice seed.
  const bank: Partial<Record<Tier, PrivateTask[]>> = {
    novice: [await loadSeed(root)],
  };

  for (const entry of reviewedSeeds) {
    const directory = join(root, 'seed_bank', entry.directory);

    try {
      await access(join(directory, 'task.json'));
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    const task = await loadReviewedSeed(
      root,
      entry.directory,
      entry.editable,
    );

    if (task.tier !== entry.tier) {
      throw new Error(`Seed tier mismatch: ${entry.directory}`);
    }

    (bank[entry.tier] ??= []).push(task);
  }

  return bank;
}
