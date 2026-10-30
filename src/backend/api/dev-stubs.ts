import type { CandidateProfile, SeamResult } from '../contracts/internal.js';
import type { Ports } from '../contracts/seams.js';
import { runSeedTests } from '../runner/local/seed-runner.js';

export const fixtureProfile: CandidateProfile = {
  domain: 'backend', domain_confidence: 1, claimed_topics: ['arrays'],
  tech_stack: ['python'], skills: ['rest-apis'],
};
const unavailable = <T>(): SeamResult<T> => ({ kind: 'unavailable', code: 'NOT_IMPLEMENTED', message: 'K1 development seam; implementation pending' });
const fixture = <T>(value: T): SeamResult<T> => ({ kind: 'fixture', value });

export function createDevPorts(): Ports {
  return {
    runTests: runSeedTests,
    chat: async (_input, context) => { context.signal.throwIfAborted(); return fixture({ content: 'Development fixture; no model was called.', model: 'fixture' }); },
    nextHint: async (input, context) => { context.signal.throwIfAborted(); return fixture({ text: 'Check which array elements the loop visits.', level: input.level }); },
    assistantReply: async (_input, context) => { context.signal.throwIfAborted(); return fixture({ blocked: true, reason: 'Assistant implementation pending' }); },
    generateAssessment: async (_input, context) => { context.signal.throwIfAborted(); return unavailable(); },
    validateTask: async (_input, context) => { context.signal.throwIfAborted(); return unavailable(); },
    parsePortfolio: () => fixture(structuredClone(fixtureProfile)),
    quiz: input => input.answers ? fixture({ focus_lane: {
      domain: input.profile.domain, skills: [...input.profile.skills], topics: [...input.profile.claimed_topics],
    } }) : fixture({ questions: [{ id: 'fixture-q1', prompt: 'Development quiz fixture', options: [{ id: 'a', text: 'Backend' }] }] }),
    calculateAie: () => unavailable(),
    buildReport: () => unavailable(),
  };
}
