import { describe, expect, it } from 'vitest';
import { creditedPassRate } from '../../scoring/aie.js';

// Task shapes from a real local assessment: P2P tests pass on the untouched starter by design.
const novice = { f2p_ids: Array.from({ length: 37 }, (_, i) => `f${i}`), p2p_ids: ['p0', 'p1', 'p2', 'p3'] };
const master = { f2p_ids: ['a', 'b', 'c', 'd', 'e'], p2p_ids: ['v', 'w', 'x', 'y', 'z'] };

describe('credit beyond the starter baseline', () => {
  it('an unchanged starter (exactly the P2P tests pass) earns nothing', () => {
    expect(creditedPassRate(4, 41, novice)).toBe(0);
    expect(creditedPassRate(5, 10, master)).toBe(0);
  });
  it('a full fix earns full credit; partial fixes are proportional to the F2P tests', () => {
    expect(creditedPassRate(41, 41, novice)).toBe(1);
    expect(creditedPassRate(8, 10, master)).toBeCloseTo(0.6);
  });
  it('breaking existing behaviour never goes below zero', () => {
    expect(creditedPassRate(2, 10, master)).toBe(0);
  });
  it('falls back to the raw rate when the run does not match the task manifest', () => {
    expect(creditedPassRate(3, 4, { f2p_ids: [], p2p_ids: [] })).toBe(0.75);
    expect(creditedPassRate(3, 6, master)).toBe(0.5);
    expect(creditedPassRate(0, 0, master)).toBe(0);
  });
});
