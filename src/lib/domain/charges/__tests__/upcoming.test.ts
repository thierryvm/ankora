import { describe, it, expect } from 'vitest';

import { money } from '@/lib/domain/types';

import {
  getUpcomingCharges,
  type UpcomingChargeInput,
  type UpcomingPaymentLedger,
} from '../upcoming';

/**
 * Builder for the minimal charge shape `getUpcomingCharges` consumes. We
 * intentionally do NOT reuse the full `ChargeRecord` builder from
 * `next-due-date.test.ts` — the helper's contract is `UpcomingChargeInput`,
 * so the test stays honest about which fields actually drive the bucketing.
 */
function makeCharge(overrides: Partial<UpcomingChargeInput> = {}): UpcomingChargeInput {
  return {
    id: 'c1',
    label: 'Electricity ENGIE',
    amount: money('65.00'),
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    paymentDay: 15,
    isActive: true,
    ...overrides,
  };
}

const NO_PAYMENTS: UpcomingPaymentLedger = new Map();

describe('getUpcomingCharges — bucketing rules (THI-192)', () => {
  it('places a charge due today (0d) into j7', () => {
    const charge = makeCharge({ paymentDay: 10 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j7).toHaveLength(1);
    expect(result.j7[0]!.daysUntilDue).toBe(0);
    expect(result.j14).toHaveLength(0);
    expect(result.j30).toHaveLength(0);
    expect(result.overdue).toHaveLength(0);
  });

  it('places a charge due in exactly 7 days into j7 (inclusive upper bound)', () => {
    const charge = makeCharge({ paymentDay: 17 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j7).toHaveLength(1);
    expect(result.j7[0]!.daysUntilDue).toBe(7);
  });

  it('places a charge due in 8 days into j14', () => {
    const charge = makeCharge({ paymentDay: 18 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j7).toHaveLength(0);
    expect(result.j14).toHaveLength(1);
    expect(result.j14[0]!.daysUntilDue).toBe(8);
  });

  it('places a charge due in exactly 14 days into j14 (inclusive upper bound)', () => {
    const charge = makeCharge({ paymentDay: 24 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j14).toHaveLength(1);
    expect(result.j14[0]!.daysUntilDue).toBe(14);
  });

  it('places a charge due in 15 days into j30', () => {
    const charge = makeCharge({ paymentDay: 25 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j30).toHaveLength(1);
    expect(result.j30[0]!.daysUntilDue).toBe(15);
  });

  it('places a charge due in exactly 30 days into j30 (inclusive upper bound)', () => {
    // 2026-05-10 + 30 = 2026-06-09. Use a quarterly charge paymentDay=9 in June.
    const charge = makeCharge({
      paymentMonths: [6],
      paymentDay: 9,
      // amount irrelevant for bucketing
    });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j30).toHaveLength(1);
    expect(result.j30[0]!.daysUntilDue).toBe(30);
  });

  it('drops charges due in more than 30 days', () => {
    // Monthly charge with paymentDay=15 + today=2026-05-10 → next is 2026-05-15 (j7).
    // To get >30d, make it annual with payment in July.
    const charge = makeCharge({
      paymentMonths: [7],
      paymentDay: 15,
    });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.overdue).toHaveLength(0);
    expect(result.j7).toHaveLength(0);
    expect(result.j14).toHaveLength(0);
    expect(result.j30).toHaveLength(0);
  });
});

describe('getUpcomingCharges — overdue handling (THI-329 payment-aware)', () => {
  it('places a passed-but-unpaid current-month occurrence into overdue', () => {
    // paymentDay=5, today=May 10 → May 5 has passed and is unpaid → overdue.
    // (The old "always roll forward" logic hid this a month/year ahead;
    // payment-aware `nextUnpaidDueDate` surfaces it.)
    const charge = makeCharge({ paymentDay: 5 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.overdue).toHaveLength(1);
    expect(result.overdue[0]!.dueDateIso).toBe('2026-05-05');
    expect(result.overdue[0]!.daysUntilDue).toBe(-5);
    expect(result.j7).toHaveLength(0);
  });

  it('skips a paid current-month occurrence (rolls forward, never overdue)', () => {
    // paymentDay=15, today=May 20 (May 15 passed) but MAY is paid → skip it,
    // roll to the next unpaid occurrence June 15 (26d → j30). Not overdue.
    const charge = makeCharge({ id: 'paidC', paymentDay: 15 });
    const payments: UpcomingPaymentLedger = new Map([['paidC-2026-5', true]]);
    const result = getUpcomingCharges({
      charges: [charge],
      payments,
      todayIso: '2026-05-20',
    });
    expect(result.overdue).toHaveLength(0);
    expect(result.j30).toHaveLength(1);
    expect(result.j30[0]!.dueDateIso).toBe('2026-06-15');
    expect(result.j30[0]!.isPaid).toBe(false);
  });
});

describe('getUpcomingCharges — filtering', () => {
  it('skips inactive charges', () => {
    const charge = makeCharge({ isActive: false, paymentDay: 11 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j7).toHaveLength(0);
  });

  it('skips charges where nextUnpaidDueDate returns null (empty paymentMonths)', () => {
    const charge = makeCharge({ paymentMonths: [] });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j7).toHaveLength(0);
    expect(result.overdue).toHaveLength(0);
  });

  it('returns the frozen empty result when every charge filters out', () => {
    const result = getUpcomingCharges({
      charges: [],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j7).toEqual([]);
    expect(result.j14).toEqual([]);
    expect(result.j30).toEqual([]);
    expect(result.overdue).toEqual([]);
  });
});

describe('getUpcomingCharges — sorting', () => {
  it('sorts each bucket by ascending daysUntilDue', () => {
    const c1 = makeCharge({ id: 'a', paymentDay: 17 }); // 7d
    const c2 = makeCharge({ id: 'b', paymentDay: 12 }); // 2d
    const c3 = makeCharge({ id: 'c', paymentDay: 14 }); // 4d
    const result = getUpcomingCharges({
      charges: [c1, c2, c3],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j7.map((i) => i.charge.id)).toEqual(['b', 'c', 'a']);
    expect(result.j7.map((i) => i.daysUntilDue)).toEqual([2, 4, 7]);
  });
});

describe('getUpcomingCharges — calendar edge cases', () => {
  it('handles month boundary correctly (annual charge due next month)', () => {
    // Annual June charge, today = end of May → next due 2026-06-02 (2d → j7).
    // (Monthly would surface the past May occurrence as overdue, not roll.)
    const charge = makeCharge({ paymentMonths: [6], paymentDay: 2 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-31',
    });
    expect(result.j7).toHaveLength(1);
    expect(result.j7[0]!.dueDateIso).toBe('2026-06-02');
    expect(result.j7[0]!.daysUntilDue).toBe(2);
  });

  it('handles year boundary correctly (annual charge due next January)', () => {
    // Annual January charge, today = end of Dec → next due 2027-01-05 (6d → j7).
    const charge = makeCharge({ paymentMonths: [1], paymentDay: 5 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-12-30',
    });
    expect(result.j7).toHaveLength(1);
    expect(result.j7[0]!.dueDateIso).toBe('2027-01-05');
    expect(result.j7[0]!.daysUntilDue).toBe(6);
  });

  it('handles paymentDay=31 clamped to actual month length (February)', () => {
    const charge = makeCharge({ paymentMonths: [2], paymentDay: 31 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-02-25',
    });
    // 2026 is not a leap year → Feb 28.
    expect(result.j7).toHaveLength(1);
    expect(result.j7[0]!.dueDateIso).toBe('2026-02-28');
    expect(result.j7[0]!.daysUntilDue).toBe(3);
  });

  it('handles leap-year Feb 29 correctly', () => {
    // 2028 is a leap year.
    const charge = makeCharge({ paymentMonths: [2], paymentDay: 31 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2028-02-25',
    });
    expect(result.j7).toHaveLength(1);
    expect(result.j7[0]!.dueDateIso).toBe('2028-02-29');
    expect(result.j7[0]!.daysUntilDue).toBe(4);
  });

  it('is deterministic given a fixed todayIso (no Date.now)', () => {
    const charge = makeCharge({ paymentDay: 17 });
    const a = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    const b = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(a).toEqual(b);
  });
});

describe('getUpcomingCharges — payment-aware skip (THI-329)', () => {
  it('skips a paid current-month occurrence and rolls past the 30-day horizon', () => {
    // rent due 15th, today May 10 (15th still ahead) but MAY already paid →
    // skip May, roll to June 15 (36d) → out of the 30-day horizon → dropped.
    const charge = makeCharge({ id: 'rent', paymentDay: 15 });
    const payments: UpcomingPaymentLedger = new Map([['rent-2026-5', true]]);
    const result = getUpcomingCharges({
      charges: [charge],
      payments,
      todayIso: '2026-05-10',
    });
    expect(result.j7).toHaveLength(0);
    expect(result.overdue).toHaveLength(0);
  });

  it('does NOT skip when the ledger entry is false (treats as unpaid)', () => {
    const charge = makeCharge({ id: 'rent', paymentDay: 15 });
    const payments: UpcomingPaymentLedger = new Map([['rent-2026-5', false]]);
    const result = getUpcomingCharges({
      charges: [charge],
      payments,
      todayIso: '2026-05-10',
    });
    expect(result.j7).toHaveLength(1);
    expect(result.j7[0]!.dueDateIso).toBe('2026-05-15');
  });

  it('does NOT skip when the ledger has no entry (unpaid)', () => {
    const charge = makeCharge({ id: 'rent', paymentDay: 15 });
    const result = getUpcomingCharges({
      charges: [charge],
      payments: NO_PAYMENTS,
      todayIso: '2026-05-10',
    });
    expect(result.j7).toHaveLength(1);
    expect(result.j7[0]!.dueDateIso).toBe('2026-05-15');
  });
});
