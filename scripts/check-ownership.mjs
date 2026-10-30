import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const branch = git('branch', '--show-current');
const owner = branch.split('/')[0];
const owners = JSON.parse(readFileSync(new URL('./owners.json', import.meta.url), 'utf8'));
if (!branch.includes('/') || !Array.isArray(owners[owner]) || owner === 'shared') {
  throw new Error('An owned feature branch is required');
}
const paths = new Set([
  ...git('diff', '--name-only', '-z', 'HEAD').split('\0'),
  ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
].filter(Boolean));
const allowed = [...owners.shared, ...owners[owner]];
const matches = (path, pattern) => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(path);
const rejected = [...paths].filter(path => !allowed.some(pattern => matches(path, pattern)));
if (rejected.length) throw new Error(`Files outside ${owner}'s ownership: ${rejected.join(', ')}`);
console.log(`Ownership check passed: ${paths.size} changed files on ${branch}`);
