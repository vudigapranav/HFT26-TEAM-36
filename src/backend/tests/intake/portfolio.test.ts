import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CandidateProfile } from '@torquecode/contracts';
import Value from 'typebox/value';
import { parsePortfolio, parsePortfolioDetailed, type DetailedProfile } from '../../intake/portfolio.js';

const fx = (n: string): unknown => JSON.parse(readFileSync(new URL(`../fixtures/portfolios/${n}.json`, import.meta.url), 'utf8'));
const ok = (n: string): DetailedProfile => {
  const r = parsePortfolioDetailed(fx(n));
  if ('errors' in r) throw new Error(`${n}: ${JSON.stringify(r.errors)}`);
  expect(Value.Check(CandidateProfile, r.profile)).toBe(true); // always a valid contract profile
  return r;
};

describe('parsePortfolio — fixtures vs EXPECTED.md', () => {
  it('normal-web → web, canonical topics, no warnings', () => {
    const r = ok('normal-web');
    expect(r.profile.claimed_topics).toEqual(['arrays', 'hashing', 'two_pointers']);
    expect(r.profile.domain).toBe('web');
    expect(r.domain_scores).toMatchObject({ web: 16, backend: 9 });
    expect(r.warnings).toEqual([]);
    expect(r.injection_flags).toEqual([]);
  });

  it('empty-topics → explicit fallback arrays, strings with a warning', () => {
    const r = ok('empty-topics');
    expect(r.profile.claimed_topics).toEqual(['arrays', 'strings']);
    expect(r.profile.domain).toBe('backend');
    expect(r.domain_scores).toMatchObject({ backend: 7, ml: 1 });
    expect(r.warnings.some(w => /fallback/i.test(w))).toBe(true);
  });

  it('typo-topics → canonical IDs', () => {
    const r = ok('typo-topics');
    expect(r.profile.claimed_topics).toEqual(['dp', 'two_pointers', 'hashing', 'bfs_dfs']);
    expect(r.profile.domain).toBe('backend');
    expect(r.domain_scores).toMatchObject({ backend: 8, web: 1, ml: 1 });
  });

  it('huge → capped with warnings, fast, never rejected', () => {
    const t0 = Date.now();
    const r = ok('huge');
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.profile.claimed_topics).toEqual(['arrays', 'strings', 'sorting']);
    expect(r.profile.domain).toBe('backend');
    expect(r.domain_scores).toMatchObject({ backend: 16, web: 8, ml: 1 });
    expect(r.warnings.some(w => /projects were used/.test(w))).toBe(true);
    expect(r.warnings.some(w => /truncated/.test(w))).toBe(true);
  });

  it('injection → flagged fields, otherwise unchanged', () => {
    const r = ok('injection');
    expect(r.injection_flags).toEqual(['projects[0].description', 'projects[0].highlights[1]']);
    expect(r.profile.claimed_topics).toEqual(['arrays', 'strings', 'hashing']);
    expect(r.profile.domain).toBe('backend');
    expect(r.domain_scores).toMatchObject({ backend: 7, web: 5 });
  });

  it('unknown-stack → fallback backend, low confidence', () => {
    const r = ok('unknown-stack');
    expect(r.profile.claimed_topics).toEqual(['arrays', 'sorting']);
    expect(r.profile.domain).toBe('backend');
    expect(r.profile.domain_confidence).toBe(0);
    expect(r.low_confidence).toBe(true);
    expect(r.warnings.some(w => /low-confidence fallback/.test(w))).toBe(true);
  });
});

describe('parsePortfolio — seam and bad input', () => {
  it('seam returns kind ok with a contract-valid profile', () => {
    const r = parsePortfolio(fx('normal-web'));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok' && !('errors' in r.value)) expect(Value.Check(CandidateProfile, r.value)).toBe(true);
  });

  it('invalid input → field-level errors, no throw', () => {
    const r = parsePortfolio({ candidate: { name: '', email: 'x' }, projects: 'no' });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok' || !('errors' in r.value)) throw new Error('expected errors');
    const paths = r.value.errors.map(e => e.path).join(' ');
    expect(paths).toContain('/candidate/name');
    expect(paths).toContain('/candidate/email');
    expect(paths).toContain('/projects');
    expect(paths).toContain('dsa_topics_solved');
  });

  it('non-object input → errors', () => {
    for (const bad of [null, 42, 'x', []]) {
      const r = parsePortfolio(bad);
      expect(r.kind === 'ok' && 'errors' in r.value).toBe(true);
    }
  });
});

describe('parsePortfolio — hardening (found by fuzzing)', () => {
  it('drops whitespace-only stack/skill entries and dedupes case variants', () => {
    const r = parsePortfolioDetailed({ candidate: { name: 'N', email: 'a+b@sub.example.org' }, projects: [],
      tech_stack: [' React ', 'REACT', 'react'], skills: ['  ', 'SQL', 'sql'], dsa_topics_solved: ['  Arrays ', 'arrays', 'array-list'] });
    if ('errors' in r) throw new Error(JSON.stringify(r.errors));
    expect(Value.Check(CandidateProfile, r.profile)).toBe(true);
    expect(r.profile.tech_stack).toEqual(['react']);
    expect(r.profile.skills).toEqual(['sql']);
    expect(r.profile.claimed_topics).toEqual(['arrays']);
  });

  it('never throws and only returns contract-valid profiles on 2,000 random inputs', () => {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)] as T;
    const junk = (d = 0): unknown => d > 3 ? pick([null, 1, ' ', 'x']) : pick([
      () => null, () => rnd() * 1e9, () => pick(['', '  ', 'a'.repeat(5000), 'arrays', '__proto__']),
      () => Array.from({ length: Math.floor(rnd() * 4) }, () => junk(d + 1)),
      () => Object.fromEntries(Array.from({ length: Math.floor(rnd() * 4) }, () => [pick(['candidate', 'projects', 'tech_stack', 'skills', 'dsa_topics_solved', '__proto__']), junk(d + 1)])),
    ])();
    for (let i = 0; i < 2000; i++) {
      const base: Record<string, unknown> = { candidate: { name: 'N', email: 'n@example.org' }, projects: [], tech_stack: ['python'], skills: ['sql'], dsa_topics_solved: ['arrays'] };
      base[pick(Object.keys(base))] = junk();
      const r = parsePortfolioDetailed(rnd() < 0.3 ? junk() : base);
      if (!('errors' in r)) expect(Value.Check(CandidateProfile, r.profile)).toBe(true);
      else expect(r.errors.length).toBeGreaterThan(0);
    }
  });
});
