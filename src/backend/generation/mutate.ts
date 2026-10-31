// Deterministic starter derivation for bug-fix tasks (K6): one small, classic slip applied
// to the reference's entry file. Pure text edits; nothing is parsed or executed on the host.
// Each candidate is then RUN through R3 and kept only if it fails visibly.
export type Mutation = { kind: string; line: number; content: string };

const RULES: { kind: string; pattern: RegExp; replace: string }[] = [
  { kind: 'off_by_one_range', pattern: /range\(len\(([A-Za-z_][\w.]*)\)\)/, replace: 'range(len($1) - 1)' },
  // Live eval (K6 gen:smoke): models usually iterate directly, so skip the last element instead.
  { kind: 'off_by_one_iteration', pattern: /^(\s*for [A-Za-z_][\w, ]* in )([A-Za-z_][\w.]*)(:)/, replace: '$1$2[:-1]$3' },
  { kind: 'off_by_one_range_start', pattern: /range\(1, len\(([A-Za-z_][\w.]*)\)\)/, replace: 'range(1, len($1) - 1)' },
  { kind: 'flipped_comparison', pattern: / <= /, replace: ' < ' },
  { kind: 'flipped_comparison', pattern: / >= /, replace: ' > ' },
  { kind: 'flipped_comparison', pattern: / < (?!=)/, replace: ' <= ' },
  { kind: 'flipped_comparison', pattern: / > (?!=)/, replace: ' >= ' },
  { kind: 'swapped_extreme', pattern: /\bmax\(/, replace: 'min(' },
  { kind: 'swapped_extreme', pattern: /\bmin\(/, replace: 'max(' },
  { kind: 'flipped_condition', pattern: / and /, replace: ' or ' },
  { kind: 'off_by_one_index', pattern: /\[-1\]/, replace: '[-2]' },
  { kind: 'off_by_one_constant', pattern: / \+ 1\b/, replace: '' },
  { kind: 'off_by_one_constant', pattern: / - 1\b/, replace: '' },
];

/** Line ranges of top-level functions, the entrypoint first. */
function functionSpans(lines: string[], func: string): [number, number][] {
  const spans: { name: string; start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^def ([A-Za-z_]\w*)\(/.exec(lines[i]!);
    if (!match) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) if (/^\S/.test(lines[j]!) && lines[j]!.trim() !== '') { end = j; break; }
    spans.push({ name: match[1]!, start: i + 1, end });
  }
  return spans.sort((a, b) => Number(b.name === func) - Number(a.name === func)).map(s => [s.start, s.end]);
}

/** Candidate starters, one mutation each, inside function bodies (entrypoint first). */
export function mutations(source: string, func: string, limit = 12): Mutation[] {
  const lines = source.split('\n');
  const spans = functionSpans(lines, func);
  if (!lines.some(line => new RegExp(`^def ${func}\\(`).test(line))) return [];
  const found: Mutation[] = [];
  const seen = new Set<string>();
  for (const [start, end] of spans) {
    let inDocstring = false;
    for (const rule of RULES) {
      for (let i = start; i < end && found.length < limit; i++) {
        const line = lines[i]!;
        const quotes = (line.match(/"""|'''/g) ?? []).length;
        if (quotes % 2 === 1) inDocstring = !inDocstring;
        if (quotes > 0 || inDocstring) continue; // never mutate docstrings
        const code = line.replace(/#.*$/, '');
        if (!rule.pattern.test(code)) continue;
        const mutated = code.replace(rule.pattern, rule.replace) + line.slice(code.length);
        if (mutated === line) continue;
        const content = [...lines.slice(0, i), mutated, ...lines.slice(i + 1)].join('\n');
        if (seen.has(content)) continue;
        seen.add(content);
        found.push({ kind: rule.kind, line: i + 1, content });
      }
      inDocstring = false;
    }
  }
  return found;
}
