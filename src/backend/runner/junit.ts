// Strict reader for pytest's JUnit XML. Fail-closed: anything unexpected
// becomes "error" for the affected tests, never "pass".
import type { TestResult } from '../contracts/internal.js';

export type Status = TestResult['status'];
export type Reported = { status: Status; duration_ms: number };

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (value: string) => value.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (whole, entity: string) => {
  if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
  if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
  return entities[entity] ?? whole;
});
const attribute = (tag: string, name: string) => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decode(match[1]!) : undefined;
};
const rank: Record<Status, number> = { pass: 0, fail: 1, error: 2, timeout: 3 };

/** pytest node id "tests/test_x.py::Class::test_y[p]" -> JUnit key "tests.test_x.Class::test_y[p]". */
export function junitKey(nodeId: string): string {
  const [path, ...rest] = nodeId.split('::');
  const name = rest.pop() ?? '';
  const classname = [path!.replace(/\.py$/, '').replaceAll('/', '.'), ...rest].join('.');
  return `${classname}::${name}`;
}

/** Returns per-key results, or null when the document is not a pytest JUnit report. */
export function parseJUnit(xml: string): Map<string, Reported> | null {
  if (!/^\s*(<\?xml[^>]*\?>\s*)?<testsuites[\s>]/.test(xml) || !/<\/testsuites>\s*$/.test(xml)) return null;
  const results = new Map<string, Reported>();
  const testcase = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const match of xml.matchAll(testcase)) {
    const tag = match[1]!;
    const body = match[3] ?? '';
    const classname = attribute(tag, 'classname');
    const name = attribute(tag, 'name');
    const time = Number(attribute(tag, 'time') ?? 'NaN');
    if (classname === undefined || name === undefined || !Number.isFinite(time) || time < 0) return null;
    // Skips (including xfail) are unexpected for graded tasks: treat as error.
    const status: Status = /<(error|skipped)\b/.test(body) ? 'error' : /<failure\b/.test(body) ? 'fail' : 'pass';
    const key = `${classname}::${name}`;
    const previous = results.get(key);
    // A duplicate entry (e.g. teardown error) can only make the result worse.
    if (!previous || rank[status] > rank[previous.status]) results.set(key, { status, duration_ms: Math.round(time * 1000) });
  }
  return results;
}

/**
 * Grades the expected test ids. Every expected id gets a status; nothing passes
 * unless pytest's exit code and the report agree.
 */
export function grade(expectedIds: string[], xml: string | null, exitCode: number | null, timedOut: boolean): Map<string, Reported> {
  const all = (status: Status) => new Map(expectedIds.map(id => [id, { status, duration_ms: 0 }]));
  if (timedOut) return all('timeout');
  // pytest: 0 = all passed, 1 = some failed. Anything else (collection error,
  // internal error, killed by OOM, sys.exit) means the run is not gradable.
  if (xml === null || (exitCode !== 0 && exitCode !== 1)) return all('error');
  const parsed = parseJUnit(xml);
  if (!parsed) return all('error');
  const graded = new Map<string, Reported>();
  for (const id of expectedIds) graded.set(id, parsed.get(junitKey(id)) ?? { status: 'error', duration_ms: 0 });
  const allPassed = [...graded.values()].every(result => result.status === 'pass');
  // Exit code and report disagree: the report (or pytest) was tampered with.
  if (allPassed !== (exitCode === 0)) return all('error');
  return graded;
}
