import { expect, it } from 'vitest';
import { createWiredPorts } from '../../api/wiring.js';
import { loadSeedBank } from '../../api/seed-bank.js';
import type { CandidateProfile } from '../../contracts/internal.js';
import type { Ports } from '../../contracts/seams.js';

it('K8 connects the real generator and falls back on provider outage', async () => {
  const bank = await loadSeedBank();
  const profile: CandidateProfile = {
    domain: 'backend',
    domain_confidence: 1,
    claimed_topics: ['arrays', 'hashing', 'sliding_window'],
    tech_stack: ['python'],
    skills: ['sql'],
  };

  let modelCalls = 0;

  const ports = createWiredPorts(bank.novice![0]!, {
    chat: async () => {
      modelCalls++;
      return {
        kind: 'unavailable',
        code: 'NOT_IMPLEMENTED',
        message: 'Simulated provider outage',
      };
    },
    runTests: async () => {
      throw new Error('Runner must not execute during provider fallback');
    },
  });

  const result = await ports.generateAssessment({
    profile,
    focus_lane: {
      domain: profile.domain,
      skills: profile.skills,
      topics: profile.claimed_topics,
    },
    progress: () => {},
  }, { signal: new AbortController().signal });

  expect(result.kind).toBe('ok');
  if (result.kind !== 'ok') return;

  expect(modelCalls).toBe(2);
  expect([
    result.value.novice.source,
    result.value.adept.source,
    result.value.master.source,
  ]).toEqual(['seed_bank', 'seed_bank', 'seed_bank']);
});

it('K8 preserves an explicitly injected generator', async () => {
  const bank = await loadSeedBank();
  const custom: Ports['generateAssessment'] = async () => ({
    kind: 'unavailable',
    code: 'NOT_IMPLEMENTED',
    message: 'Custom test provider',
  });

  expect(createWiredPorts(bank.novice![0]!, {
    generateAssessment: custom,
  }).generateAssessment).toBe(custom);
});
