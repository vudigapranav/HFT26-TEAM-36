import { describe, expect, it } from 'vitest';
import type { Topic } from '@torquecode/contracts';
import type { PrivateTask } from '../../contracts/internal.js';
import { claimsVsDemonstrated } from '../../scoring/claims.js';

type T = Pick<PrivateTask, 'task_id' | 'tier' | 'dsa_topics'>;
const nov: T = { task_id: 'nov', tier: 'novice', dsa_topics: ['arrays', 'hashing'] };
const ade: T = { task_id: 'ade', tier: 'adept', dsa_topics: ['hashing', 'two_pointers'] };
const mas: T = { task_id: 'mas', tier: 'master', dsa_topics: ['hashing', 'sliding_window'] };
const row = (task_id: string, passed: number, total = 5) => ({ task_id, passed, total });
const profile = (claimed_topics: Topic[]) => ({ claimed_topics });

describe('claimsVsDemonstrated (P8)', () => {
  it('one entry per claimed topic, in profile order; untested topics are null/null', () => {
    const r = claimsVsDemonstrated(profile(['two_pointers', 'arrays', 'dp']), [nov, ade], [row('nov', 5), row('ade', 2)]);
    expect(r).toEqual([
      { topic: 'two_pointers', tested_by: 'ade', demonstrated: false },
      { topic: 'arrays', tested_by: 'nov', demonstrated: true },
      { topic: 'dp', tested_by: null, demonstrated: null },
    ]);
  });
  it('a fully solved task wins over a higher unsolved tier', () => {
    const r = claimsVsDemonstrated(profile(['hashing']), [nov, ade, mas], [row('nov', 5), row('ade', 1), row('mas', 0)]);
    expect(r).toEqual([{ topic: 'hashing', tested_by: 'nov', demonstrated: true }]);
  });
  it('among equally solved tasks the higher tier wins', () => {
    expect(claimsVsDemonstrated(profile(['hashing']), [nov, ade, mas], [row('nov', 5), row('ade', 5), row('mas', 5)])[0]?.tested_by).toBe('mas');
    expect(claimsVsDemonstrated(profile(['hashing']), [nov, ade, mas], [row('nov', 0), row('ade', 1), row('mas', 0)])[0]?.tested_by).toBe('mas');
  });
  it('tasks without a report row do not count as tested', () => {
    expect(claimsVsDemonstrated(profile(['sliding_window']), [mas], [])).toEqual([{ topic: 'sliding_window', tested_by: null, demonstrated: null }]);
  });
  it('total 0 is never demonstrated; topics a task uses but the candidate never claimed are ignored', () => {
    const r = claimsVsDemonstrated(profile(['arrays']), [nov, ade], [row('nov', 0, 0), row('ade', 5)]);
    expect(r).toEqual([{ topic: 'arrays', tested_by: 'nov', demonstrated: false }]);
  });
  it('is deterministic and does not mutate its inputs', () => {
    const tasks = [mas, nov, ade];
    const rows = [row('nov', 5), row('ade', 5), row('mas', 0)];
    const snapshot = JSON.stringify({ tasks, rows });
    const a = claimsVsDemonstrated(profile(['hashing', 'arrays']), tasks, rows);
    expect(claimsVsDemonstrated(profile(['hashing', 'arrays']), tasks, rows)).toEqual(a);
    expect(JSON.stringify({ tasks, rows })).toBe(snapshot);
  });
});
