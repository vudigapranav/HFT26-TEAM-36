// Pure, deterministic intake helpers: topic normalization, domain detection, prompt-injection flagging.
import type { Domain, Topic } from '@torquecode/contracts';
import type { DomainRules, Taxonomy } from './data.js';

export const DOMAINS: Domain[] = ['web', 'ml', 'security', 'backend'];

// taxonomy.json rule: lowercase, trim, collapse spaces/hyphens/underscores; exact synonym match only, never guess.
export const normKey = (s: string) => s.toLowerCase().trim().replace(/[\s\-_]+/g, ' ');

export function normalizeTopics(raw: string[], tax: Taxonomy) {
  const index = new Map<string, Topic>();
  for (const [canonical, synonyms] of Object.entries(tax.topics)) {
    index.set(normKey(canonical), canonical as Topic);
    for (const s of synonyms) index.set(normKey(s), canonical as Topic);
  }
  const topics: Topic[] = [];
  const warnings: string[] = [];
  for (const r of raw) {
    const c = index.get(normKey(r));
    if (!c) { warnings.push(`Unknown DSA topic "${r.slice(0, 60)}" was ignored.`); continue; }
    if (!topics.includes(c)) topics.push(c);
  }
  let usedFallback = false;
  if (topics.length === 0) {
    // Context §10.1 A2: no topics claimed → fallback, explicitly reported (never silent).
    usedFallback = true;
    topics.push(...(tax.fallback_topics as Topic[]));
    warnings.push(`No DSA topics claimed, using fallback ${tax.fallback_topics.join(', ')}.`);
  }
  return { topics, warnings, usedFallback };
}

export function detectDomain(tokens: Set<string>, rules: DomainRules) {
  const scores = { web: 0, ml: 0, security: 0, backend: 0 } as Record<Domain, number>;
  for (const d of DOMAINS) for (const [kw, w] of Object.entries(rules.domains[d] ?? {})) if (tokens.has(kw)) scores[d] += w;
  const rank = (d: Domain) => { const i = rules.tie_break_order.indexOf(d); return i === -1 ? 99 : i; };
  const order = [...DOMAINS].sort((a, b) => scores[b] - scores[a] || rank(a) - rank(b));
  const top = order[0] as Domain;
  const second = order[1] as Domain;
  const total = DOMAINS.reduce((s, d) => s + scores[d], 0);
  if (scores[top] === 0) {
    return { domain: rules.fallback_domain, confidence: 0, lowConfidence: true, scores,
      warning: 'No known stack keywords, so the domain is a low-confidence fallback.' as string | undefined };
  }
  const lowConfidence = scores[top] < rules.thresholds.low_confidence_below_score
    || scores[top] - scores[second] < rules.thresholds.low_confidence_margin;
  return { domain: top, confidence: Math.round((scores[top] / total) * 100) / 100, lowConfidence, scores,
    warning: lowConfidence ? `Domain "${top}" detected with low confidence.` : undefined };
}

export const toToken = (s: string) => s.toLowerCase().trim();

// Text is untrusted DATA. We only flag suspicious fields; nothing here acts on the text.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any |the )?(previous |prior |above )?instructions/i,
  /disregard (all |any |the )?(previous |prior |above )?(instructions|rules)/i,
  /system (note|prompt|message)/i,
  /^\s*(assistant|system)\s*:/i,
  /(print|reveal|show|give)( me)? (the )?(full )?(reference )?solution/i,
  /mark (every|all) tests? as passed/i,
  /you are now/i,
  /make (the )?tasks? (trivial|easy|easier)/i,
];
export const findInjection = (fields: { path: string; text: string }[]) =>
  fields.filter(f => INJECTION_PATTERNS.some(re => re.test(f.text))).map(f => f.path);
