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
