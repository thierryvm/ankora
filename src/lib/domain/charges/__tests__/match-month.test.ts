import { describe, it, expect } from 'vitest';

import { money } from '@/lib/domain/types';
import { chargeMatchesMonth } from '../match-month';
import type { ChargeRecord } from '../types';

function makeCharge(overrides: Partial<ChargeRecord> = {}): ChargeRecord {
  return {
    id: 'c',
    workspaceId: 'ws',
    label: 'X',
    amount: money('10'),
    frequency: 'quarterly',
    paymentMonths: [3, 6, 9, 12],
    paymentDay: 15,
    dueMonth: 3,
    sortOrder: 0,
    categoryId: null,
    isActive: true,
    notes: null,
    paidFrom: 'principal',
    ...overrides,
  };
}

describe('chargeMatchesMonth', () => {
  it('returns true for an active charge in a matching month', () => {
    expect(chargeMatchesMonth(makeCharge(), 2026, 3)).toBe(true);
    expect(chargeMatchesMonth(makeCharge(), 2026, 6)).toBe(true);
    expect(chargeMatchesMonth(makeCharge(), 2026, 12)).toBe(true);
  });

  it('returns false for an active charge in a non-matching month', () => {
    expect(chargeMatchesMonth(makeCharge(), 2026, 1)).toBe(false);
    expect(chargeMatchesMonth(makeCharge(), 2026, 5)).toBe(false);
    expect(chargeMatchesMonth(makeCharge(), 2026, 11)).toBe(false);
  });

  it('returns false for an inactive charge even on a matching month', () => {
    expect(chargeMatchesMonth(makeCharge({ isActive: false }), 2026, 3)).toBe(false);
  });

  it('returns false for invalid month inputs', () => {
    expect(chargeMatchesMonth(makeCharge(), 2026, 0)).toBe(false);
    expect(chargeMatchesMonth(makeCharge(), 2026, 13)).toBe(false);
    expect(chargeMatchesMonth(makeCharge(), 2026, 5.5)).toBe(false);
  });

  it('matches monthly charges in every month', () => {
    const c = makeCharge({
      frequency: 'monthly',
      paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    });
    for (let m = 1; m <= 12; m += 1) {
      expect(chargeMatchesMonth(c, 2026, m)).toBe(true);
    }
  });

  it('matches an annual charge only in its single month', () => {
    const c = makeCharge({ frequency: 'annual', paymentMonths: [11] });
    for (let m = 1; m <= 12; m += 1) {
      expect(chargeMatchesMonth(c, 2026, m)).toBe(m === 11);
    }
  });

  it('returns false when paymentMonths is empty', () => {
    expect(chargeMatchesMonth(makeCharge({ paymentMonths: [] }), 2026, 6)).toBe(false);
  });

  it('year argument does not currently filter (PR-D5+ extension point)', () => {
    expect(chargeMatchesMonth(makeCharge(), 1999, 3)).toBe(true);
    expect(chargeMatchesMonth(makeCharge(), 2099, 3)).toBe(true);
  });
});
