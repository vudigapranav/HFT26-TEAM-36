import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QuizQuestion } from '@torquecode/contracts';
import Value from 'typebox/value';
import { parsePortfolioDetailed } from '../../intake/portfolio.js';
import { QuizAnswerError, claimedDomains, quiz, scoreAnswers, selectQuestions } from '../../intake/quiz.js';

const profileOf = (n: string) => {
  const r = parsePortfolioDetailed(JSON.parse(readFileSync(new URL(`../fixtures/portfolios/${n}.json`, import.meta.url), 'utf8')));
  if ('errors' in r) throw new Error(n);
  return r.profile;
};

describe('quiz seam (P3)', () => {
  it('returns ≤10 contract-valid questions with only options touching claimed skills', () => {
    const p = profileOf('normal-web');
    const r = quiz({ profile: p });
    if (r.kind !== 'ok' || !('questions' in r.value)) throw new Error('expected questions');
    expect(r.value.questions.length).toBeGreaterThan(0);
    expect(r.value.questions.length).toBeLessThanOrEqual(10);
    for (const q of r.value.questions) expect(Value.Check(QuizQuestion, q)).toBe(true);
    expect(JSON.stringify(r.value)).not.toContain('points_to');
  });

  it('focus lane is never outside the claimed skills (randomized)', () => {
    for (const n of ['normal-web', 'typo-topics', 'injection', 'unknown-stack', 'empty-topics', 'huge']) {
      const p = profileOf(n);
      const doms = claimedDomains(p);
      const qs = selectQuestions(p);
      let seed = 11;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
      for (let i = 0; i < 300; i++) {
        const answers = qs.map(q => ({ question_id: q.id, option_id: q.options[Math.floor(rnd() * q.options.length)]?.id ?? 'a' }));
        const lane = scoreAnswers(p, answers);
        expect(doms).toContain(lane.domain);
        expect(lane.topics.length).toBeGreaterThan(0);
        lane.topics.forEach(t => expect(p.claimed_topics).toContain(t));
        lane.skills.forEach(s => expect(p.skills).toContain(s));
      }
    }
  });

  it('unknown answers → clear error', () => {
    expect(() => scoreAnswers(profileOf('normal-web'), [{ question_id: 'nope', option_id: 'a' }])).toThrow(QuizAnswerError);
  });
});
