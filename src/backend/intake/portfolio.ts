// P1 + P2 — parsePortfolio seam (owner: Pranav).
// Untrusted JSON → CandidateProfile, or field-level errors. Deterministic; no LLM.
import { Portfolio, type CandidateProfile } from '@torquecode/contracts';
import Value from 'typebox/value';
import type { SeamResult } from '../contracts/internal.js';
import { domainRules, taxonomy } from './data.js';
import { detectDomain, findInjection, normalizeTopics, toToken } from './normalize.js';

// Caps follow the Portfolio contract limits so oversized input is trimmed with a warning instead of rejected.
export const CAPS = {
  projects: 20, description: 4000, highlights: 20, highlight: 1000, projectStack: 30, stackItem: 60,
  techStack: 50, skills: 50, skill: 100, topics: 50, topic: 60, name: 120, role: 200, profileStack: 50,
} as const;

export type PortfolioErrors = { errors: { path: string; message: string }[] };
export type DetailedProfile = {
  profile: CandidateProfile;
  warnings: string[];
  injection_flags: string[];
  domain_scores: Record<'web' | 'ml' | 'security' | 'backend', number>;
  low_confidence: boolean;
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// Trims arrays/strings to the contract's limits before validation. Leaves wrong types alone so validation reports them.
function capInput(raw: unknown, warnings: string[]): unknown {
  if (!isObj(raw)) return raw;
  let truncated = 0;
  const str = (v: unknown, n: number) => { if (typeof v === 'string' && v.length > n) { truncated++; return v.slice(0, n); } return v; };
  const list = (v: unknown, max: number, item: number, what: string) => {
    if (!Array.isArray(v)) return v;
    if (v.length > max) warnings.push(`${what} was capped at ${max} items.`);
    return v.slice(0, max).map(x => str(x, item));
  };
  const out: Record<string, unknown> = { ...raw };
  if (isObj(raw.candidate)) out.candidate = { ...raw.candidate, name: str(raw.candidate.name, CAPS.name) };
  if (Array.isArray(raw.projects)) {
    if (raw.projects.length > CAPS.projects) warnings.push(`Only the first ${CAPS.projects} of ${raw.projects.length} projects were used.`);
    out.projects = raw.projects.slice(0, CAPS.projects).map((p: unknown, i: number) => !isObj(p) ? p : {
      ...p,
      name: str(p.name, CAPS.name),
      description: str(p.description, CAPS.description),
      role: str(p.role, CAPS.role),
      tech_stack: list(p.tech_stack, CAPS.projectStack, CAPS.stackItem, `projects[${i}].tech_stack`),
      highlights: list(p.highlights, CAPS.highlights, CAPS.highlight, `projects[${i}].highlights`),
    });
  }
  out.tech_stack = list(raw.tech_stack, CAPS.techStack, CAPS.stackItem, 'tech_stack');
  out.skills = list(raw.skills, CAPS.skills, CAPS.skill, 'skills');
  out.dsa_topics_solved = list(raw.dsa_topics_solved, CAPS.topics, CAPS.topic, 'dsa_topics_solved');
  if (truncated > 0) warnings.push(`${truncated} long text field(s) were truncated.`);
  return out;
}

export function parsePortfolioDetailed(input: unknown): DetailedProfile | PortfolioErrors {
  const warnings: string[] = [];
  const capped = capInput(input, warnings);
  if (!Value.Check(Portfolio, capped)) {
    const seen = new Set<string>();
    const errors = [...Value.Errors(Portfolio, capped)].map(e => {
      const missing = (e.params as { requiredProperties?: string[] }).requiredProperties;
      const path = missing?.length ? [e.instancePath, missing.join(',')].filter(Boolean).join('/') : e.instancePath || '(root)';
      return { path: path.slice(0, 200), message: e.message.slice(0, 300) };
    }).filter(e => (seen.has(e.path) ? false : (seen.add(e.path), true))).slice(0, 50);
    return { errors };
  }
  const p = capped as Portfolio;

  const injection_flags = findInjection(p.projects.flatMap((pr, i) => [
    { path: `projects[${i}].name`, text: pr.name },
    { path: `projects[${i}].description`, text: pr.description },
    ...pr.highlights.map((h, j) => ({ path: `projects[${i}].highlights[${j}]`, text: h })),
  ]));
  if (injection_flags.length) warnings.push(`Possible prompt-injection text in ${injection_flags.join(', ')}; treated as plain text.`);

  const t = normalizeTopics(p.dsa_topics_solved, taxonomy);
  warnings.push(...t.warnings);

  // Profile tech stack = distinct tokens from top-level and all project stacks (domain rules use the same set).
  // Whitespace-only entries normalize to '' and are dropped (the profile contract requires non-empty strings).
  const tokens = (xs: string[]) => [...new Set(xs.map(toToken).filter(Boolean))];
  const stack = tokens([...p.tech_stack, ...p.projects.flatMap(pr => pr.tech_stack)]).slice(0, CAPS.profileStack);
  const skills = tokens(p.skills).slice(0, CAPS.skills);
  const d = detectDomain(new Set([...stack, ...skills]), domainRules);
  if (d.warning) warnings.push(d.warning);

  return {
    profile: { domain: d.domain, domain_confidence: d.confidence, claimed_topics: t.topics, tech_stack: stack, skills },
    warnings, injection_flags, domain_scores: d.scores, low_confidence: d.lowConfidence,
  };
}

/** The same capped, contract-checked portfolio the profile was built from, or null if it doesn't validate. */
export function validPortfolio(input: unknown): Portfolio | null {
  const capped = capInput(input, []);
  return Value.Check(Portfolio, capped) ? capped as Portfolio : null;
}

// Seam signature from contracts/seams.ts (Ports.parsePortfolio).
export function parsePortfolio(input: unknown): SeamResult<CandidateProfile | PortfolioErrors> {
  const r = parsePortfolioDetailed(input);
  return { kind: 'ok', value: 'errors' in r ? r : r.profile };
}
