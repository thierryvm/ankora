import { describe, it, expect } from 'vitest';

import { money } from '@/lib/domain/types';
import { chargesPaidForMonth, chargesUnpaidForMonth, isChargePaidForMonth } from '../queries';
import type { ChargePaymentRecord } from '../types';
import type { ChargeRecord } from '@/lib/domain/charges/types';

function makeCharge(overrides: Partial<ChargeRecord> = {}): ChargeRecord {
  return {
    id: 'c',
    workspaceId: 'ws',
    label: 'Charge',
    amount: money('100'),
    frequency: 'monthly',
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    paymentDay: 5,
    dueMonth: 1,
    sortOrder: 0,
    categoryId: null,
    isActive: true,
    notes: null,
    paidFrom: 'principal',
    ...overrides,
  };
}

function makePayment(overrides: Partial<ChargePaymentRecord> = {}): ChargePaymentRecord {
  return {
    id: 'p',
    chargeId: 'c',
    workspaceId: 'ws',
    periodYear: 2026,
    periodMonth: 5,
    paidAt: '2026-05-07T10:00:00Z',
    paidAmount: money('100'),
    bucketId: null,
    note: null,
    createdBy: 'u',
    createdAt: '2026-05-07T10:00:00Z',
    ...overrides,
  };
}

describe('isChargePaidForMonth', () => {
  it('returns false on empty payments', () => {
    expect(isChargePaidForMonth('c1', [], 2026, 5)).toBe(false);
  });

  it('returns true when a matching payment exists', () => {
    const p = makePayment({ chargeId: 'c1' });
    expect(isChargePaidForMonth('c1', [p], 2026, 5)).toBe(true);
  });

  it('returns false on chargeId mismatch', () => {
    const p = makePayment({ chargeId: 'other' });
    expect(isChargePaidForMonth('c1', [p], 2026, 5)).toBe(false);
  });

  it('returns false on year mismatch', () => {
    const p = makePayment({ chargeId: 'c1', periodYear: 2025 });
    expect(isChargePaidForMonth('c1', [p], 2026, 5)).toBe(false);
  });

  it('returns false on month mismatch', () => {
    const p = makePayment({ chargeId: 'c1', periodMonth: 4 });
    expect(isChargePaidForMonth('c1', [p], 2026, 5)).toBe(false);
  });

  it('idempotent against duplicate payment rows', () => {
    const p1 = makePayment({ chargeId: 'c1' });
    const p2 = makePayment({ chargeId: 'c1', id: 'p2' });
    expect(isChargePaidForMonth('c1', [p1, p2], 2026, 5)).toBe(true);
  });
});

describe('chargesPaidForMonth', () => {
  it('returns empty list for no charges', () => {
    expect(chargesPaidForMonth([], [], 2026, 5)).toEqual([]);
  });

  it('returns only paid active charges, in input order', () => {
    const c1 = makeCharge({ id: 'c1', sortOrder: 1 });
    const c2 = makeCharge({ id: 'c2', sortOrder: 0 });
    const c3 = makeCharge({ id: 'c3' });
    const payments = [
      makePayment({ id: 'p2', chargeId: 'c2' }),
      makePayment({ id: 'p1', chargeId: 'c1' }),
    ];
    const result = chargesPaidForMonth([c1, c2, c3], payments, 2026, 5);
    expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('excludes inactive charges even if a payment row exists', () => {
    const c1 = makeCharge({ id: 'c1', isActive: false });
    const payments = [makePayment({ chargeId: 'c1' })];
    expect(chargesPaidForMonth([c1], payments, 2026, 5)).toEqual([]);
  });

  it('respects year boundary', () => {
    const c1 = makeCharge({ id: 'c1' });
    const payments = [makePayment({ chargeId: 'c1', periodYear: 2025 })];
    expect(chargesPaidForMonth([c1], payments, 2026, 5)).toEqual([]);
  });
});

describe('chargesUnpaidForMonth', () => {
  it('returns empty list when no charges match the month', () => {
    const c = makeCharge({ id: 'c', frequency: 'annual', paymentMonths: [12] });
    expect(chargesUnpaidForMonth([c], [], 2026, 5)).toEqual([]);
  });

  it('returns all due charges when no payments exist yet', () => {
    const c1 = makeCharge({ id: 'c1' });
    const c2 = makeCharge({ id: 'c2' });
    const result = chargesUnpaidForMonth([c1, c2], [], 2026, 5);
    expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('excludes already-paid charges', () => {
    const c1 = makeCharge({ id: 'c1' });
    const c2 = makeCharge({ id: 'c2' });
    const payments = [makePayment({ chargeId: 'c1' })];
    expect(chargesUnpaidForMonth([c1, c2], payments, 2026, 5).map((c) => c.id)).toEqual(['c2']);
  });

  it('excludes inactive charges', () => {
    const c1 = makeCharge({ id: 'c1', isActive: false });
    const c2 = makeCharge({ id: 'c2' });
    expect(chargesUnpaidForMonth([c1, c2], [], 2026, 5).map((c) => c.id)).toEqual(['c2']);
  });

  it('handles quarterly charges — month inside paymentMonths', () => {
    const q = makeCharge({
      id: 'q',
      frequency: 'quarterly',
      paymentMonths: [3, 6, 9, 12],
    });
    expect(chargesUnpaidForMonth([q], [], 2026, 6).map((c) => c.id)).toEqual(['q']);
    expect(chargesUnpaidForMonth([q], [], 2026, 5)).toEqual([]);
  });

  it('handles annual charges', () => {
    const a = makeCharge({
      id: 'a',
      frequency: 'annual',
      paymentMonths: [11],
    });
    expect(chargesUnpaidForMonth([a], [], 2026, 11).map((c) => c.id)).toEqual(['a']);
    for (let m = 1; m <= 12; m += 1) {
      if (m !== 11) expect(chargesUnpaidForMonth([a], [], 2026, m)).toEqual([]);
    }
  });

  it('paid in another year still appears as unpaid for the current year', () => {
    const c1 = makeCharge({ id: 'c1' });
    const payments = [makePayment({ chargeId: 'c1', periodYear: 2025 })];
    expect(chargesUnpaidForMonth([c1], payments, 2026, 5).map((c) => c.id)).toEqual(['c1']);
  });

  it('returns charges in input order (not re-sorted)', () => {
    const c1 = makeCharge({ id: 'c1', sortOrder: 5 });
    const c2 = makeCharge({ id: 'c2', sortOrder: 0 });
    const c3 = makeCharge({ id: 'c3', sortOrder: 3 });
    expect(chargesUnpaidForMonth([c1, c2, c3], [], 2026, 5).map((c) => c.id)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('empty paymentMonths excludes the charge', () => {
    const c = makeCharge({ id: 'c', paymentMonths: [] });
    expect(chargesUnpaidForMonth([c], [], 2026, 5)).toEqual([]);
  });

  it('handles trimestriel décalé [1,4,7,10]', () => {
    const c = makeCharge({ id: 'c', frequency: 'quarterly', paymentMonths: [1, 4, 7, 10] });
    expect(chargesUnpaidForMonth([c], [], 2026, 4).map((c) => c.id)).toEqual(['c']);
    expect(chargesUnpaidForMonth([c], [], 2026, 5)).toEqual([]);
  });
});
