import { describe, expect, it } from 'vitest';

import { paymentMonthsFromFrequency } from '../payment-months-from-frequency';

describe('paymentMonthsFromFrequency', () => {
  it('returns [1..12] for monthly regardless of dueMonth', () => {
    expect(paymentMonthsFromFrequency('monthly', 1)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(paymentMonthsFromFrequency('monthly', 5)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('returns 4 months for quarterly anchored on dueMonth', () => {
    expect(paymentMonthsFromFrequency('quarterly', 1)).toEqual([1, 4, 7, 10]);
    expect(paymentMonthsFromFrequency('quarterly', 3)).toEqual([3, 6, 9, 12]);
  });

  it('wraps quarterly across the year boundary correctly', () => {
    // dueMonth 11 → 11, 2, 5, 8 → sorted [2, 5, 8, 11]
    expect(paymentMonthsFromFrequency('quarterly', 11)).toEqual([2, 5, 8, 11]);
    // dueMonth 12 → 12, 3, 6, 9 → sorted [3, 6, 9, 12]
    expect(paymentMonthsFromFrequency('quarterly', 12)).toEqual([3, 6, 9, 12]);
  });

  it('returns 2 months for semiannual anchored on dueMonth', () => {
    expect(paymentMonthsFromFrequency('semiannual', 2)).toEqual([2, 8]);
    expect(paymentMonthsFromFrequency('semiannual', 6)).toEqual([6, 12]);
  });

  it('wraps semiannual across the year boundary correctly', () => {
    expect(paymentMonthsFromFrequency('semiannual', 9)).toEqual([3, 9]);
    expect(paymentMonthsFromFrequency('semiannual', 12)).toEqual([6, 12]);
  });

  it('returns [dueMonth] for annual', () => {
    expect(paymentMonthsFromFrequency('annual', 1)).toEqual([1]);
    expect(paymentMonthsFromFrequency('annual', 6)).toEqual([6]);
    expect(paymentMonthsFromFrequency('annual', 12)).toEqual([12]);
  });

  it('clamps out-of-range dueMonth defensively (no crash)', () => {
    expect(paymentMonthsFromFrequency('annual', 0)).toEqual([1]);
    expect(paymentMonthsFromFrequency('annual', 13)).toEqual([12]);
    expect(paymentMonthsFromFrequency('annual', -5)).toEqual([1]);
    expect(paymentMonthsFromFrequency('annual', Number.NaN)).toEqual([1]);
  });

  it('output is always sorted ascending', () => {
    for (let m = 1; m <= 12; m += 1) {
      const out = paymentMonthsFromFrequency('quarterly', m);
      const sorted = [...out].sort((a, b) => a - b);
      expect(out).toEqual(sorted);
    }
  });
});
