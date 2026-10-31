import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createWiredPorts } from '../../api/wiring.js';
import { loadSeedBank } from '../../api/seed-bank.js';
import { createDockerRunner } from '../../runner/dockerRunner.js';
import type { CandidateProfile } from '../../contracts/internal.js';
import type { Ports } from '../../contracts/seams.js';

// Since the independent-validation policy (#60) a fallback seed is released only after the same semantic
// verification as a generated task, which executes the reference in the isolated runner. So this needs Docker.
const ready = spawnSync('docker', ['image', 'inspect', 'torquecode-runner-python:dev'], { stdio: 'ignore', timeout: 5000 }).status === 0;

describe.skipIf(!ready)('K8 wiring through the real runner', () => {
  it('K8 connects the real generator and falls back to verified seeds on provider outage', async () => {
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
      runTests: createDockerRunner(),
    });

    const result = await ports.generateAssessment({
      profile,
      focus_lane: {
        domain: profile.domain,
        skills: profile.skills,
        topics: profile.claimed_topics,
      },
      progress: () => {},
    }, { signal: AbortSignal.timeout(300_000) });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    // The provider was asked and failed; nothing is claimed as generated.
    expect(modelCalls).toBeGreaterThan(0);
    expect([
      result.value.novice.source,
      result.value.adept.source,
      result.value.master.source,
    ]).toEqual(['seed_bank', 'seed_bank', 'seed_bank']);
  }, 320_000);
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
