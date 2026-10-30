import { describe, expect, it } from 'vitest';
import { loadSeedBank } from '../../api/seed-bank.js';

describe('K10 reviewed question sets', () => {
  it('loads all three actual seed tasks', async () => {
    const bank = await loadSeedBank();

    expect(bank.novice).toHaveLength(1);
    expect(bank.adept).toHaveLength(1);
    expect(bank.master).toHaveLength(1);

    expect(bank.novice?.[0]?.task_id)
      .toBe('seed-novice-request-summary');
    expect(bank.adept?.[0]?.task_id)
      .toBe('seed-adept-event-dedupe');
    expect(bank.master?.[0]?.task_id)
      .toBe('seed-master-session-window');
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
