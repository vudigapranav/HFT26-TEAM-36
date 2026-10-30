import { describe, expect, it } from 'vitest';
import type { Topic } from '@torquecode/contracts';
import type { PrivateTask } from '../../contracts/internal.js';
import { attemptedTaskIds, claimsVsDemonstrated } from '../../scoring/claims.js';

type T = Pick<PrivateTask, 'task_id' | 'tier' | 'dsa_topics'>;
const nov: T = { task_id: 'nov', tier: 'novice', dsa_topics: ['arrays', 'hashing'] };
const ade: T = { task_id: 'ade', tier: 'adept', dsa_topics: ['hashing', 'two_pointers'] };
const mas: T = { task_id: 'mas', tier: 'master', dsa_topics: ['hashing', 'sliding_window'] };
const row = (task_id: string, passed: number, total = 5) => ({ task_id, passed, total });
const profile = (claimed_topics: Topic[]) => ({ claimed_topics });
const ALL = new Set(['nov', 'ade', 'mas']);

describe('claimsVsDemonstrated (P8)', () => {
  it('one entry per claimed topic, in profile order; untested topics are null/null', () => {
    const r = claimsVsDemonstrated(profile(['two_pointers', 'arrays', 'dp']), [nov, ade], [row('nov', 5), row('ade', 2)], ALL);
    expect(r).toEqual([
      { topic: 'two_pointers', tested_by: 'ade', demonstrated: false },
      { topic: 'arrays', tested_by: 'nov', demonstrated: true },
      { topic: 'dp', tested_by: null, demonstrated: null },
    ]);
  });
  it('a fully solved task wins over a higher unsolved tier', () => {
    const r = claimsVsDemonstrated(profile(['hashing']), [nov, ade, mas], [row('nov', 5), row('ade', 1), row('mas', 0)], ALL);
    expect(r).toEqual([{ topic: 'hashing', tested_by: 'nov', demonstrated: true }]);
  });
  it('among equally solved tasks the higher tier wins', () => {
    expect(claimsVsDemonstrated(profile(['hashing']), [nov, ade, mas], [row('nov', 5), row('ade', 5), row('mas', 5)], ALL)[0]?.tested_by).toBe('mas');
    expect(claimsVsDemonstrated(profile(['hashing']), [nov, ade, mas], [row('nov', 0), row('ade', 1), row('mas', 0)], ALL)[0]?.tested_by).toBe('mas');
  });
  it('tasks without a report row do not count as tested', () => {
    expect(claimsVsDemonstrated(profile(['sliding_window']), [mas], [], ALL)).toEqual([{ topic: 'sliding_window', tested_by: null, demonstrated: null }]);
  });
  it('total 0 is never demonstrated; topics a task uses but the candidate never claimed are ignored', () => {
    const r = claimsVsDemonstrated(profile(['arrays']), [nov, ade], [row('nov', 0, 0), row('ade', 5)], ALL);
    expect(r).toEqual([{ topic: 'arrays', tested_by: 'nov', demonstrated: false }]);
  });
  it('is deterministic and does not mutate its inputs', () => {
    const tasks = [mas, nov, ade];
    const rows = [row('nov', 5), row('ade', 5), row('mas', 0)];
    const snapshot = JSON.stringify({ tasks, rows });
    const a = claimsVsDemonstrated(profile(['hashing', 'arrays']), tasks, rows, ALL);
    expect(claimsVsDemonstrated(profile(['hashing', 'arrays']), tasks, rows, ALL)).toEqual(a);
    expect(JSON.stringify({ tasks, rows })).toBe(snapshot);
  });
});

describe('claimsVsDemonstrated — attempted tasks only (P11)', () => {
  it('an available task the candidate never attempted counts as not tested', () => {
    const r = claimsVsDemonstrated(profile(['two_pointers']), [nov, ade], [row('nov', 5), row('ade', 0)], new Set(['nov']));
    expect(r).toEqual([{ topic: 'two_pointers', tested_by: null, demonstrated: null }]);
  });
  it('an attempted lower tier beats an unattempted higher tier', () => {
    const r = claimsVsDemonstrated(profile(['hashing']), [nov, ade, mas], [row('nov', 2), row('ade', 0), row('mas', 0)], new Set(['nov']));
    expect(r).toEqual([{ topic: 'hashing', tested_by: 'nov', demonstrated: false }]);
  });
  it('attemptedTaskIds = tasks with at least one run or submit event', () => {
    const e = (task_id: string, type: 'run' | 'submit' | 'hint_served' | 'paste') =>
      ({ session_id: 's', task_id, ts: '2026-10-31T00:00:00Z', source: 'server' as const, type, payload: {} });
    expect([...attemptedTaskIds([e('nov', 'run'), e('ade', 'submit'), e('mas', 'hint_served'), e('x', 'paste')])].sort()).toEqual(['ade', 'nov']);
  });
});

