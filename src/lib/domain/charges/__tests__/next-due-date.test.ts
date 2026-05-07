import { describe, it, expect } from 'vitest';

import { money } from '@/lib/domain/types';
import { nextDueDateForCharge } from '../next-due-date';
import type { ChargeRecord } from '../types';

function makeCharge(overrides: Partial<ChargeRecord> = {}): ChargeRecord {
  return {
    id: 'c',
    workspaceId: 'ws',
    label: 'X',
    amount: money('10'),
    frequency: 'monthly',
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    paymentDay: 15,
    dueMonth: 1,
    sortOrder: 0,
    categoryId: null,
    isActive: true,
    notes: null,
    paidFrom: 'principal',
    ...overrides,
  };
}

describe('nextDueDateForCharge', () => {
  it('returns null for an inactive charge', () => {
    expect(nextDueDateForCharge(makeCharge({ isActive: false }), '2026-05-07')).toBeNull();
  });

  it('returns null when paymentMonths is empty', () => {
    expect(nextDueDateForCharge(makeCharge({ paymentMonths: [] }), '2026-05-07')).toBeNull();
  });

  it('monthly charge — current month, payment day in the future', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 28 }), '2026-05-07');
    expect(r).toBe('2026-05-28');
  });

  it('monthly charge — payment day already passed → next month', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 5 }), '2026-05-07');
    expect(r).toBe('2026-06-05');
  });

  it('monthly charge — exactly today', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 7 }), '2026-05-07');
    expect(r).toBe('2026-05-07');
  });

  it('quarterly charge [3,6,9,12] from January', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'quarterly', paymentMonths: [3, 6, 9, 12], paymentDay: 15 }),
      '2026-01-15',
    );
    expect(r).toBe('2026-03-15');
  });

  it('quarterly — between two due months', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'quarterly', paymentMonths: [3, 6, 9, 12], paymentDay: 1 }),
      '2026-04-15',
    );
    expect(r).toBe('2026-06-01');
  });

  it('annual — December next year', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'annual', paymentMonths: [12], paymentDay: 1 }),
      '2026-12-15',
    );
    expect(r).toBe('2027-12-01');
  });

  it('annual — same month, day in future', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'annual', paymentMonths: [11], paymentDay: 30 }),
      '2026-11-01',
    );
    expect(r).toBe('2026-11-30');
  });

  it('annual — current month, day already passed', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'annual', paymentMonths: [11], paymentDay: 1 }),
      '2026-11-15',
    );
    expect(r).toBe('2027-11-01');
  });

  it('semiannual [6,12] from January', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'semiannual', paymentMonths: [6, 12], paymentDay: 1 }),
      '2026-01-01',
    );
    expect(r).toBe('2026-06-01');
  });

  it('clamps day 31 to month last day — February non-leap', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 31 }), '2027-02-01');
    expect(r).toBe('2027-02-28');
  });

  it('clamps day 31 to February 29 in a leap year (2024)', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 31 }), '2024-02-01');
    expect(r).toBe('2024-02-29');
  });

  it('clamps day 31 in April (30 days)', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 31 }), '2026-04-01');
    expect(r).toBe('2026-04-30');
  });

  it('reference date end of month, paymentDay smaller → next month', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 5 }), '2026-05-31');
    expect(r).toBe('2026-06-05');
  });

  it('reference date Dec 31, monthly → Jan 5 next year', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 5 }), '2026-12-31');
    expect(r).toBe('2027-01-05');
  });

  it('returns null for malformed reference ISO', () => {
    expect(nextDueDateForCharge(makeCharge(), 'not-a-date')).toBeNull();
  });

  it('handles paymentDay 1 (start of month)', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 1 }), '2026-05-15');
    expect(r).toBe('2026-06-01');
  });

  it('handles a charge with paymentMonths covering only the current month, day in past', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentMonths: [5], paymentDay: 1 }), '2026-05-15');
    expect(r).toBe('2027-05-01');
  });

  it('handles a charge with paymentMonths covering only the current month, day today', () => {
    const r = nextDueDateForCharge(
      makeCharge({ paymentMonths: [5], paymentDay: 15 }),
      '2026-05-15',
    );
    expect(r).toBe('2026-05-15');
  });

  it('quarterly at Q1 boundary — Mar 1, paymentDay 1, [3,6,9,12]', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'quarterly', paymentMonths: [3, 6, 9, 12], paymentDay: 1 }),
      '2026-03-01',
    );
    expect(r).toBe('2026-03-01');
  });

  it('quarterly at Q1 boundary — Mar 2, paymentDay 1, [3,6,9,12] → June', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'quarterly', paymentMonths: [3, 6, 9, 12], paymentDay: 1 }),
      '2026-03-02',
    );
    expect(r).toBe('2026-06-01');
  });

  it('handles year transition for monthly — Dec 31 → Jan 1', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 1 }), '2026-12-31');
    expect(r).toBe('2027-01-01');
  });

  it('crossing year for quarterly — Dec → next Mar', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'quarterly', paymentMonths: [3, 6, 9, 12], paymentDay: 15 }),
      '2026-12-20',
    );
    expect(r).toBe('2027-03-15');
  });

  it('paymentDay 30 in Feb leap year → 29', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 30 }), '2024-02-01');
    expect(r).toBe('2024-02-29');
  });

  it('paymentDay 30 in Feb 2026 (non-leap) → 28', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 30 }), '2026-02-01');
    expect(r).toBe('2026-02-28');
  });

  it('semiannual [6,12] — current month June, day in future', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'semiannual', paymentMonths: [6, 12], paymentDay: 30 }),
      '2026-06-01',
    );
    expect(r).toBe('2026-06-30');
  });

  it('semiannual [6,12] — current month July → December', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'semiannual', paymentMonths: [6, 12], paymentDay: 15 }),
      '2026-07-01',
    );
    expect(r).toBe('2026-12-15');
  });

  it('handles paymentMonths=[1] with reference date in late December', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'annual', paymentMonths: [1], paymentDay: 15 }),
      '2026-12-25',
    );
    expect(r).toBe('2027-01-15');
  });

  it('charge with paymentDay 31 across all 12 months — May 31 today', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 31 }), '2026-05-15');
    expect(r).toBe('2026-05-31');
  });

  it('mid-month reference, paymentDay 15 today match', () => {
    const r = nextDueDateForCharge(makeCharge({ paymentDay: 15 }), '2026-05-15');
    expect(r).toBe('2026-05-15');
  });

  it('supports custom paymentMonths [4,10] — semiannuel décalé', () => {
    const r = nextDueDateForCharge(
      makeCharge({ frequency: 'semiannual', paymentMonths: [4, 10], paymentDay: 1 }),
      '2026-05-01',
    );
    expect(r).toBe('2026-10-01');
  });
});
