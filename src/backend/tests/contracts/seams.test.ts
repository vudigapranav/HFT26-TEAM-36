import { expect, it } from 'vitest';
import { smokeSeams } from '../../api/smoke-seams.js';
import { createDevPorts, fixtureProfile } from '../../api/dev-stubs.js';

it('calls all ten seams without network access or fabricated validation/scoring', async () => {
  const results = await smokeSeams();
  expect(Object.keys(results)).toHaveLength(10);
  expect(results.runTests).toBe('ok');
  expect(results.parsePortfolio).toBe('fixture');
  expect(results.validateTask).toBe('unavailable');
  expect(results.generateAssessment).toBe('unavailable');
  expect(results.calculateAie).toBe('unavailable');
  expect(results.buildReport).toBe('unavailable');
});

it('keeps quiz fixture lanes within the supplied profile and honors cancellation', async () => {
  const ports = createDevPorts();
  const result = ports.quiz({ profile: fixtureProfile, answers: [] });
  expect(result).toMatchObject({ kind: 'fixture', value: { focus_lane: { topics: fixtureProfile.claimed_topics, skills: fixtureProfile.skills } } });
  await expect(ports.chat({ messages: [], model: 'fixture', purpose: 'generation', max_tokens: 10 }, { signal: AbortSignal.abort() })).rejects.toThrow();
});
