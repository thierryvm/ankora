import { describe, it, expect } from 'vitest';

import { currentPeriodDueDate, type CurrentPeriodCharge } from '../current-period-due-date';

const charge = (over: Partial<CurrentPeriodCharge> = {}): CurrentPeriodCharge => ({
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: 1,
  isActive: true,
  ...over,
});

const JUNE = { year: 2026, month: 6 } as const;

describe('currentPeriodDueDate', () => {
  it('labels a due-this-month occurrence whose day has passed as overdue (this month, not next)', () => {
    const res = currentPeriodDueDate(charge(), JUNE, '2026-06-04', false);
    expect(res).toEqual({ dueDateIso: '2026-06-01', status: 'overdue' });
  });

  it('labels a due-this-month occurrence whose day is still ahead as dueThisMonth', () => {
    const res = currentPeriodDueDate(charge({ paymentDay: 20 }), JUNE, '2026-06-04', false);
    expect(res).toEqual({ dueDateIso: '2026-06-20', status: 'dueThisMonth' });
  });

  it('paid beats overdue: a paid current-month bill stays on this month as paid (never rolls to July)', () => {
    const res = currentPeriodDueDate(charge(), JUNE, '2026-06-04', true);
    expect(res).toEqual({ dueDateIso: '2026-06-01', status: 'paid' });
  });

  it('paid beats dueThisMonth: a paid current-month bill due later this month is paid', () => {
    const res = currentPeriodDueDate(charge({ paymentDay: 20 }), JUNE, '2026-06-04', true);
    expect(res).toEqual({ dueDateIso: '2026-06-20', status: 'paid' });
  });

  it('returns the next occurrence as upcoming when the current month is not a payment month (quarterly)', () => {
    // Quarterly [1,4,7,10]; June is not a payment month → next is July.
    const res = currentPeriodDueDate(
      charge({ paymentMonths: [1, 4, 7, 10] }),
      JUNE,
      '2026-06-04',
      false,
    );
    expect(res).toEqual({ dueDateIso: '2026-07-01', status: 'upcoming' });
  });

  it('rolls an annual bill to next year when its month is behind the current one', () => {
    // Annual [3] (March); June → next March is 2027.
    const res = currentPeriodDueDate(charge({ paymentMonths: [3] }), JUNE, '2026-06-04', false);
    expect(res).toEqual({ dueDateIso: '2027-03-01', status: 'upcoming' });
  });

  it('clamps paymentDay to the last day of a short month (Feb, non-leap)', () => {
    const res = currentPeriodDueDate(
      charge({ paymentMonths: [2], paymentDay: 31 }),
      { year: 2026, month: 2 },
      '2026-02-01',
      false,
    );
    expect(res).toEqual({ dueDateIso: '2026-02-28', status: 'dueThisMonth' });
  });

  it('clamps paymentDay to Feb 29 on a leap year', () => {
    const res = currentPeriodDueDate(
      charge({ paymentMonths: [2], paymentDay: 31 }),
      { year: 2028, month: 2 },
      '2028-02-01',
      false,
    );
    expect(res).toEqual({ dueDateIso: '2028-02-29', status: 'dueThisMonth' });
  });

  it('handles the year boundary (December current month, January-only charge)', () => {
    const res = currentPeriodDueDate(
      charge({ paymentMonths: [1] }),
      { year: 2026, month: 12 },
      '2026-12-15',
      false,
    );
    expect(res).toEqual({ dueDateIso: '2027-01-01', status: 'upcoming' });
  });

  it('returns null for an inactive charge', () => {
    expect(currentPeriodDueDate(charge({ isActive: false }), JUNE, '2026-06-04', false)).toBeNull();
  });

  it('returns null when paymentMonths is empty', () => {
    expect(
      currentPeriodDueDate(charge({ paymentMonths: [] }), JUNE, '2026-06-04', false),
    ).toBeNull();
  });

  it('treats the exact due day as dueThisMonth, not overdue (strict ISO comparison)', () => {
    // dueDateIso === todayIso → not overdue the day it falls due.
    const res = currentPeriodDueDate(charge(), JUNE, '2026-06-01', false);
    expect(res).toEqual({ dueDateIso: '2026-06-01', status: 'dueThisMonth' });
  });

  it('anchors a paid semiannual charge to the current month (offset 0 wins over the other payment month)', () => {
    // Semiannual [6, 12]; June is the current month and is paid → paid on the
    // June occurrence, never the December one.
    const res = currentPeriodDueDate(charge({ paymentMonths: [6, 12] }), JUNE, '2026-06-15', true);
    expect(res).toEqual({ dueDateIso: '2026-06-01', status: 'paid' });
  });
});
