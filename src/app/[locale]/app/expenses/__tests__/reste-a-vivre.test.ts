import { describe, expect, it } from 'vitest';

import { resteAVivreStatus } from '../reste-a-vivre';

describe('resteAVivreStatus', () => {
  it('computes the remaining budget and spent ratio', () => {
    const s = resteAVivreStatus(500, 77, 14);
    expect(s.remaining).toBe(423);
    expect(s.spentRatio).toBeCloseTo(77 / 500, 10);
    expect(s.isOver).toBe(false);
  });

  it('spreads the remaining over the days left', () => {
    const s = resteAVivreStatus(500, 80, 14);
    expect(s.perDay).toBeCloseTo(420 / 14, 10); // 30 €/day
  });

  it('flags an over-budget month and clamps the ratio to 1', () => {
    const s = resteAVivreStatus(500, 620, 10);
    expect(s.remaining).toBe(-120);
    expect(s.isOver).toBe(true);
    expect(s.spentRatio).toBe(1);
    expect(s.perDay).toBeNull(); // nothing left to spread
  });

  it('has no per-day figure when the month is over (0 days left)', () => {
    expect(resteAVivreStatus(500, 100, 0).perDay).toBeNull();
  });

  it('treats any spend against a 0 budget as fully over', () => {
    const s = resteAVivreStatus(0, 10, 5);
    expect(s.spentRatio).toBe(1);
    expect(s.isOver).toBe(true);
    expect(s.remaining).toBe(-10);
  });

  it('is a clean slate at zero spend', () => {
    const s = resteAVivreStatus(500, 0, 20);
    expect(s.remaining).toBe(500);
    expect(s.spentRatio).toBe(0);
    expect(s.isOver).toBe(false);
    expect(s.perDay).toBeCloseTo(25, 10);
  });
});
