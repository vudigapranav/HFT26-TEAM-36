// FIXED, trusted test templates (K6). The model never writes test code: these templates turn
// structured cases into pytest files that call the candidate function with plain data
// (the R3 split-container format), and expected values come from running the reference.
import type { Case } from './spec.js';

/** Python source literal for a plain-data value (JSON scalars/arrays/objects or R3-tagged values). */
export function pyLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return Number.isInteger(value) ? String(value) : JSON.stringify(value);
  }
  // A JSON string literal is a valid Python string literal (same escapes, ASCII-only via \u).
  if (typeof value === 'string') return JSON.stringify(value).replace(/[\u007f-￿]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (Array.isArray(value)) return `[${value.map(pyLiteral).join(', ')}]`;
  if (typeof value === 'object') {
    const tagged = value as { __t?: unknown; v?: unknown };
    if (tagged.__t === 'tuple' && Array.isArray(tagged.v)) return tagged.v.length === 1 ? `(${pyLiteral(tagged.v[0])},)` : `(${tagged.v.map(pyLiteral).join(', ')})`;
    if (tagged.__t === 'dict' && Array.isArray(tagged.v)) return `{${(tagged.v as [unknown, unknown][]).map(([k, v]) => `${pyLiteral(k)}: ${pyLiteral(v)}`).join(', ')}}`;
    if ((tagged.__t === 'set' || tagged.__t === 'frozenset') && Array.isArray(tagged.v)) {
      const inner = tagged.v.map(pyLiteral).join(', ');
      return tagged.__t === 'set' ? (tagged.v.length ? `{${inner}}` : 'set()') : `frozenset([${inner}])`;
    }
    if (tagged.__t !== undefined) throw new Error('unsupported tagged value');
    return `{${Object.entries(value).map(([k, v]) => `${pyLiteral(k)}: ${pyLiteral(v)}`).join(', ')}}`;
  }
  throw new Error('unsupported value');
}

const call = (func: string, c: Case) =>
  `${func}(${[...c.args.map(pyLiteral), ...Object.entries(c.kwargs).map(([k, v]) => `${k}=${pyLiteral(v)}`)].join(', ')})`;

/**
 * Probe: runs each case against the reference inside the TRUSTED grader and reports the encoded
 * result through the failure message. The nonce lives only in this (grader-side) file, so the
 * reference running in the worker can't forge a probe line.
 */
export function renderProbe(module: string, func: string, cases: Case[], nonce: string): string {
  // The marker is assembled at runtime so pytest's echo of these source lines never matches it.
  const lines = ['import protocol', `from ${module} import ${func}`, '', `MARK = "TORQUE_PROBE " + ${JSON.stringify(nonce)}`, ''];
  cases.forEach((c, i) => {
    lines.push(`def test_probe_${i}():`, '    try:', `        value = ${call(func, c)}`, '    except Exception as exc:',
      `        raise AssertionError(MARK + " ${i} raises " + type(exc).__name__)`,
      `    raise AssertionError(MARK + " ${i} value " + protocol.dumps(protocol.encode(value)))`, '');
  });
  return lines.join('\n');
}

export type Outcome = { kind: 'value'; value: unknown } | { kind: 'raises'; exception: string };
const RAISABLE = new Set(['ValueError', 'TypeError', 'KeyError', 'IndexError', 'ZeroDivisionError', 'ArithmeticError', 'LookupError', 'RuntimeError', 'NotImplementedError', 'AttributeError', 'OverflowError']);

/** Reads probe outcomes from the grader's output; null unless every case reported exactly once. */
export function parseProbe(output: string, nonce: string, count: number): Outcome[] | null {
  const outcomes = new Map<number, Outcome>();
  // Only pytest's failure-detail lines ("E   AssertionError: ..."), not the short summary.
  for (const match of output.matchAll(new RegExp(`^E\\s+AssertionError: TORQUE_PROBE ${nonce} (\\d+) (value|raises) (.+)$`, 'gm'))) {
    const index = Number(match[1]);
    if (outcomes.has(index)) return null;
    if (match[2] === 'raises') {
      if (!RAISABLE.has(match[3]!.trim())) return null;
      outcomes.set(index, { kind: 'raises', exception: match[3]!.trim() });
    } else {
      try { outcomes.set(index, { kind: 'value', value: JSON.parse(match[3]!) }); } catch { return null; }
    }
  }
  if (outcomes.size !== count) return null;
  return Array.from({ length: count }, (_, i) => outcomes.get(i)!);
}

/** The released test file: plain-data calls with expected values computed from the reference. */
export function renderTests(module: string, func: string, cases: { c: Case; outcome: Outcome; name: string }[]): string {
  const lines = ['import pytest', '', `from ${module} import ${func}`, ''];
  for (const { c, outcome, name } of cases) {
    lines.push('', `def ${name}():`);
    if (outcome.kind === 'raises') lines.push(`    with pytest.raises(${outcome.exception}):`, `        ${call(func, c)}`);
    else lines.push(`    assert ${call(func, c)} == ${pyLiteral(outcome.value)}`);
  }
  return `${lines.join('\n')}\n`;
}
