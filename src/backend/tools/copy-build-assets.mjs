// Build step: copy non-TypeScript runtime assets into dist/. Pure Node fs (no mkdir -p / cp),
// so `pnpm build` works the same on Windows (cmd.exe) and POSIX shells.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** [source directory, file extension]; top-level files only, like the old `cp dir/*.ext` globs. */
export const ASSETS = [['api/db/migrations', '.sql'], ['intake', '.json'], ['tools', '.py']];

/** @param {string} root backend package root  @returns {string[]} copied paths, relative, '/'-separated */
export function copyBuildAssets(root, out = join(root, 'dist')) {
  const copied = [];
  for (const [dir, ext] of ASSETS) {
    const from = join(root, ...dir.split('/'));
    const to = join(out, ...dir.split('/'));
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(ext)) continue;
      cpSync(join(from, entry.name), join(to, entry.name));
      copied.push(`${dir}/${entry.name}`);
    }
  }
  return copied;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const copied = copyBuildAssets(process.cwd());
  console.log(`Copied ${copied.length} build assets into dist/`);
}
