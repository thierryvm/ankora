import { describe, it, expect } from 'vitest';

import { nextUnpaidDueDate, type PaymentAwareCharge } from '../next-unpaid-due-date';

/**
 * Ledger key format MUST match `paymentKey()` (cockpit/types.ts):
 *   `${chargeId}-${year}-${month}`  — NO zero-padding on month.
 * The ledger is mono-month in production (only the current period is loaded),
 * so a "paid" entry only ever exists for the current (year, month).
 */
const paid = (entries: Array<[string, number, number]>): ReadonlyMap<string, boolean> =>
  new Map(entries.map(([id, y, m]) => [`${id}-${y}-${m}`, true]));

const charge = (over: Partial<PaymentAwareCharge> = {}): PaymentAwareCharge => ({
  id: 'c1',
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: 1,
  isActive: true,
  ...over,
});

describe('nextUnpaidDueDate', () => {
  it('returns the current-month occurrence as OVERDUE when its day has passed and it is unpaid', () => {
    // Monthly, day 1, today June 4 → June 1 is past + unpaid.
    const res = nextUnpaidDueDate(charge(), new Map(), '2026-06-04');
    expect(res).toEqual({ dueDateIso: '2026-06-01', isOverdue: true });
  });

  it('rolls to the next occurrence (not overdue) when the current month is already paid', () => {
    // Monthly, June paid → next unpaid occurrence is July 1.
    const res = nextUnpaidDueDate(charge(), paid([['c1', 2026, 6]]), '2026-06-04');
    expect(res).toEqual({ dueDateIso: '2026-07-01', isOverdue: false });
  });

  it('returns the current-month occurrence (not overdue) when its day is still ahead', () => {
    const res = nextUnpaidDueDate(charge({ paymentDay: 20 }), new Map(), '2026-06-04');
    expect(res).toEqual({ dueDateIso: '2026-06-20', isOverdue: false });
  });

  it('skips months not in paymentMonths (quarterly) → next quarter, not overdue', () => {
    // Quarterly [1,4,7,10] (post-backfill S.W.D.E), today June → July 1.
    const res = nextUnpaidDueDate(
      charge({ paymentMonths: [1, 4, 7, 10] }),
      new Map(),
      '2026-06-04',
    );
    expect(res).toEqual({ dueDateIso: '2026-07-01', isOverdue: false });
  });

  it('surfaces an annual bill whose due day just passed as OVERDUE', () => {
    // Taxe voiture: annual [6], day 1, today June 4 → June 1 overdue.
    const res = nextUnpaidDueDate(
      charge({ paymentMonths: [6], paymentDay: 1 }),
      new Map(),
      '2026-06-04',
    );
    expect(res).toEqual({ dueDateIso: '2026-06-01', isOverdue: true });
  });

  it('rolls an annual bill to next year when this year occurrence is in the past', () => {
    // Annual [3] (March), today June → next March is 2027.
    const res = nextUnpaidDueDate(charge({ paymentMonths: [3] }), new Map(), '2026-06-04');
    expect(res).toEqual({ dueDateIso: '2027-03-01', isOverdue: false });
  });

  it('clamps paymentDay to the last day of a short month', () => {
    // Day 31 in February 2026 (not leap) → 28.
    const res = nextUnpaidDueDate(
      charge({ paymentMonths: [2], paymentDay: 31 }),
      new Map(),
      '2026-01-01',
    );
    expect(res).toEqual({ dueDateIso: '2026-02-28', isOverdue: false });
  });

  it('handles the year boundary (December → January)', () => {
    const res = nextUnpaidDueDate(charge({ paymentMonths: [1] }), new Map(), '2026-12-15');
    expect(res).toEqual({ dueDateIso: '2027-01-01', isOverdue: false });
  });

  it('returns null for an inactive charge', () => {
    expect(nextUnpaidDueDate(charge({ isActive: false }), new Map(), '2026-06-04')).toBeNull();
  });

  it('returns null when paymentMonths is empty', () => {
    expect(nextUnpaidDueDate(charge({ paymentMonths: [] }), new Map(), '2026-06-04')).toBeNull();
  });

  it('returns null for a malformed fromIso', () => {
    expect(nextUnpaidDueDate(charge(), new Map(), 'not-a-date')).toBeNull();
  });
});
