// Defensive parsing of the model's task proposal (K6). Everything here is untrusted:
// the model proposes a header (title, statement, topics, entrypoint, input cases)
// and reference files. It never supplies test code or expected outputs.
import type { File, Topic } from '../contracts/internal.js';

export type Case = { args: unknown[]; kwargs: Record<string, unknown>; visibility: 'visible' | 'hidden' };
export type Proposal = {
  title: string; statement_md: string; dsa_topics: Topic[]; module: string; func: string; entryPath: string;
  cases: Case[]; files: File[];
};
export type ParseResult = { ok: true; value: Proposal } | { ok: false; reason: string };

const MAX_OUTPUT = 60_000;
const MAX_FILE = 12_000;
const PATH = /^app\/(?:[a-z_][a-z0-9_]*\/)*[a-z_][a-z0-9_]*\.py$/;
const IDENT = /^[a-z_][a-z0-9_]*$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Plain data the R3 boundary carries: JSON scalars, arrays, objects with string keys; bounded depth/size. */
export function isPlainData(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 2000 && value.every(item => isPlainData(item, depth + 1));
  if (isRecord(value)) return Object.keys(value).length <= 200 && Object.values(value).every(item => isPlainData(item, depth + 1));
  return false;
}

export function parseProposal(text: string, claimed: Topic[]): ParseResult {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, reason: 'empty output' };
  if (text.length > MAX_OUTPUT) return { ok: false, reason: 'output too long' };
  const header = /<task>\s*([\s\S]*?)\s*<\/task>/.exec(text);
  if (!header) return { ok: false, reason: 'missing <task> header' };
  let data: unknown;
  try { data = JSON.parse(header[1]!); } catch { return { ok: false, reason: 'task header is not valid JSON' }; }
  if (!isRecord(data)) return { ok: false, reason: 'task header is not an object' };

  const { title, statement_md, dsa_topics, entrypoint, cases } = data;
  if (typeof title !== 'string' || title.trim().length < 3 || title.length > 120) return { ok: false, reason: 'bad title' };
  if (typeof statement_md !== 'string' || statement_md.trim().length < 20 || statement_md.length > 2000) return { ok: false, reason: 'bad statement' };
  if (!Array.isArray(dsa_topics) || dsa_topics.length === 0 || !dsa_topics.every(t => typeof t === 'string')) return { ok: false, reason: 'bad dsa_topics' };
  const topics = [...new Set(dsa_topics as string[])];
  if (!topics.every(t => (claimed as string[]).includes(t))) return { ok: false, reason: 'dsa_topics outside the claimed topics' };
  // Hints are NOT taken from the model: they're derived from the injected bug (generate.ts).
  if (typeof entrypoint !== 'string') return { ok: false, reason: 'missing entrypoint' };
  const [entryPath, func, extra] = entrypoint.split(':');
  if (extra !== undefined || !entryPath || !func || !PATH.test(entryPath) || !IDENT.test(func) || func.startsWith('_')) {
    return { ok: false, reason: 'entrypoint must be "app/<module>.py:<function>"' };
  }

  if (!Array.isArray(cases) || cases.length < 6 || cases.length > 12) return { ok: false, reason: 'expected 6-12 cases' };
  const parsedCases: Case[] = [];
  for (const item of cases) {
    if (!isRecord(item) || !Array.isArray(item.args) || (item.visibility !== 'visible' && item.visibility !== 'hidden')) {
      return { ok: false, reason: 'each case needs args[] and visibility' };
    }
    const kwargs = item.kwargs === undefined ? {} : item.kwargs;
    if (!isRecord(kwargs) || !Object.keys(kwargs).every(k => IDENT.test(k))) return { ok: false, reason: 'bad kwargs' };
    if (!isPlainData(item.args) || !isPlainData(kwargs)) return { ok: false, reason: 'case values must be plain data' };
    // Model-supplied "expected" values are ignored on purpose: outputs come from running the reference.
    parsedCases.push({ args: item.args, kwargs, visibility: item.visibility });
  }
  const visible = parsedCases.filter(c => c.visibility === 'visible').length;
  if (visible < 3 || parsedCases.length - visible < 3) return { ok: false, reason: 'need at least 3 visible and 3 hidden cases' };
  if (JSON.stringify(parsedCases).length > 200_000) return { ok: false, reason: 'cases too large' };

  const files: File[] = [];
  for (const match of text.matchAll(/<file path="([^"]+)">\n?([\s\S]*?)<\/file>/g)) {
    const path = match[1]!;
    const content = match[2]!.replace(/\r\n/g, '\n');
    if (!PATH.test(path)) return { ok: false, reason: `file path ${JSON.stringify(path.slice(0, 60))} not allowed` };
    if (content.length > MAX_FILE) return { ok: false, reason: 'reference file too large' };
    if (files.some(f => f.path === path)) return { ok: false, reason: 'duplicate file' };
    files.push({ path, content: content.endsWith('\n') ? content : `${content}\n`, editable: true });
  }
  if (files.length === 0 || files.length > 3) return { ok: false, reason: 'expected 1-3 reference files' };
  const entryFile = files.find(f => f.path === entryPath);
  if (!entryFile) return { ok: false, reason: 'entrypoint file missing' };
  if (!new RegExp(`^def ${func}\\(`, 'm').test(entryFile.content)) return { ok: false, reason: 'entrypoint function not defined at top level' };

  const module = entryPath.slice(0, -3).replaceAll('/', '.');
  return { ok: true, value: {
    title: title.trim(), statement_md: statement_md.trim(), dsa_topics: topics as Topic[], module, func, entryPath,
    cases: parsedCases, files,
  } };
}
