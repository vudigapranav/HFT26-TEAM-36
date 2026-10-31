import { describe, expect, it } from 'vitest';
import { loadSeedBank } from '../../api/seed-bank.js';

describe('K10 reviewed question sets', () => {
  it('loads every reviewed seed task, richer-topic seeds first', async () => {
    const bank = await loadSeedBank();

    expect(bank.novice?.map(t => t.task_id)).toEqual(['seed-novice-request-summary']);
    expect(bank.adept?.map(t => t.task_id))
      .toEqual(['seed-adept-event-dedupe', 'seed-adept-bucket-rollup']);
    expect(bank.master?.map(t => t.task_id))
      .toEqual(['seed-master-session-window', 'seed-master-error-budget']);
    // Arrays-only Adept/Master seeds keep every portfolio able to reach all three sets.
    expect(bank.adept?.[1]?.dsa_topics).toEqual(['arrays']);
    expect(bank.master?.[1]?.dsa_topics).toEqual(['arrays']);
  });

  it('keeps server-only data separate from candidate files', async () => {
    const bank = await loadSeedBank();

    for (const tier of ['novice', 'adept', 'master'] as const) {
      const task = bank[tier]![0]!;

      expect(task.reference_files.length)
        .toBe(task.files.length);
      expect(task.tests.some(t => t.visibility === 'hidden'))
        .toBe(true);
      expect(task.visible_tests.length).toBeGreaterThan(0);
      expect(task.hint_ladder).toHaveLength(3);
      expect(task.tests.flatMap(t => t.ids).length)
        .toBe(task.f2p_ids.length + task.p2p_ids.length);
    }
  });

  it('preserves the immutable support modules', async () => {
    const bank = await loadSeedBank();

    for (const tier of ['adept', 'master'] as const) {
      const task = bank[tier]![0]!;

      expect(task.files.filter(f => f.editable))
        .toHaveLength(2);
      expect(task.files.filter(f => !f.editable))
        .toHaveLength(1);

      for (const file of task.files.filter(f => !f.editable)) {
        const reference = task.reference_files.find(
          f => f.path === file.path,
        );
        expect(file.content).toBe(reference?.content);
      }
    }
  });
});
