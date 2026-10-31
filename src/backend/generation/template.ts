// FIXED, trusted test templates (K6). The model never writes test code: these templates turn
// structured cases into pytest files that call the candidate function with plain data
// (the R3 split-container format), and expected values come from independent family oracles.
type Case = {args: unknown[]; kwargs: Record<string, unknown>; visibility: 'visible'|'hidden'};

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

export type Outcome = { kind: 'value'; value: unknown } | { kind: 'raises'; exception: string };
/** Render server-owned cases with independently specified expected values. */
export function renderTests(module: string, func: string, cases: { c: Case; outcome: Outcome; name: string }[]): string {
  const lines = ['import pytest', '', `from ${module} import ${func}`, ''];
  for (const { c, outcome, name } of cases) {
    lines.push('', `def ${name}():`);
    if (outcome.kind === 'raises') lines.push(`    with pytest.raises(${outcome.exception}):`, `        ${call(func, c)}`);
    else lines.push(`    assert ${call(func, c)} == ${pyLiteral(outcome.value)}`);
  }
  return `${lines.join('\n')}\n`;
}
