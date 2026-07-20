import { describe, it, expect } from 'vitest';

import {
  endPeriod,
  installmentPeriods,
  isDueInPeriod,
  installmentAmountOf,
  remainingBalance,
  installmentsPaid,
  isFinished,
  periodKey,
  type Commitment,
} from '../schedule';

const commitment = (over: Partial<Commitment> = {}): Commitment => ({
  id: 'k1',
  kind: 'debt',
  totalAmount: 4200,
  installmentAmount: 250,
  installmentsTotal: 17,
  startYear: 2026,
  startMonth: 8,
  paymentDay: 15,
  frequency: 'monthly',
  isActive: true,
  ...over,
});

const paidSet = (periods: Array<[number, number]>): ReadonlySet<string> =>
  new Set(periods.map(([y, m]) => `${y}-${m}`));

describe('installmentPeriods', () => {
  it('lists every monthly instalment from the anchor', () => {
    const periods = installmentPeriods(
      commitment({ installmentsTotal: 3, startYear: 2026, startMonth: 11 }),
    );
    expect(periods).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });

  it('honours a quarterly cadence (SPF-style plan)', () => {
    const periods = installmentPeriods(
      commitment({ frequency: 'quarterly', installmentsTotal: 3, startMonth: 11, startYear: 2026 }),
    );
    expect(periods).toEqual([
      { year: 2026, month: 11 },
      { year: 2027, month: 2 },
      { year: 2027, month: 5 },
    ]);
  });

  it('honours a semiannual cadence across a year boundary', () => {
    const periods = installmentPeriods(
      commitment({ frequency: 'semiannual', installmentsTotal: 4, startYear: 2026, startMonth: 7 }),
    );
    expect(periods).toEqual([
      { year: 2026, month: 7 },
      { year: 2027, month: 1 },
      { year: 2027, month: 7 },
      { year: 2028, month: 1 },
    ]);
  });

  it('honours an annual cadence over several years', () => {
    const periods = installmentPeriods(
      commitment({ frequency: 'annual', installmentsTotal: 3, startYear: 2026, startMonth: 11 }),
    );
    expect(periods).toEqual([
      { year: 2026, month: 11 },
      { year: 2027, month: 11 },
      { year: 2028, month: 11 },
    ]);
  });

  it('returns a single period for a one-off', () => {
    const periods = installmentPeriods(
      commitment({ kind: 'one_off', installmentsTotal: 1, installmentAmount: null }),
    );
    expect(periods).toEqual([{ year: 2026, month: 8 }]);
  });
});

describe('endPeriod', () => {
  it('derives the LAST instalment period (never stored)', () => {
    expect(
      endPeriod(commitment({ installmentsTotal: 3, startYear: 2026, startMonth: 11 })),
    ).toEqual({ year: 2027, month: 1 });
  });

  it('equals the anchor for a one-off', () => {
    expect(endPeriod(commitment({ kind: 'one_off', installmentsTotal: 1 }))).toEqual({
      year: 2026,
      month: 8,
    });
  });

  it('respects a non-monthly cadence for the final period', () => {
    // SPF-style: 8 quarterly instalments from Feb 2026 → last one 21 months later.
    expect(
      endPeriod(
        commitment({
          frequency: 'quarterly',
          installmentsTotal: 8,
          startYear: 2026,
          startMonth: 2,
        }),
      ),
    ).toEqual({ year: 2027, month: 11 });
  });

  it('handles a long-running schedule spanning several years', () => {
    // 60 monthly instalments from June 2024 → May 2029.
    expect(
      endPeriod(commitment({ installmentsTotal: 60, startYear: 2024, startMonth: 6 })),
    ).toEqual({ year: 2029, month: 5 });
  });
});

describe('periodKey', () => {
  it('formats the ledger key as `year-month`, unpadded (matches the payments ledger)', () => {
    expect(periodKey(2026, 1)).toBe('2026-1');
    expect(periodKey(2026, 11)).toBe('2026-11');
  });
});

describe('isDueInPeriod', () => {
  const c = commitment({ installmentsTotal: 3, startYear: 2026, startMonth: 11 });

  it('is due on each scheduled period', () => {
    expect(isDueInPeriod(c, { year: 2026, month: 11 })).toBe(true);
    expect(isDueInPeriod(c, { year: 2027, month: 1 })).toBe(true);
  });

  it('is not due before the anchor nor after the last instalment', () => {
    expect(isDueInPeriod(c, { year: 2026, month: 10 })).toBe(false);
    expect(isDueInPeriod(c, { year: 2027, month: 2 })).toBe(false);
  });

  it('is never due when inactive', () => {
    expect(isDueInPeriod({ ...c, isActive: false }, { year: 2026, month: 11 })).toBe(false);
  });

  it('skips off-cadence months for a quarterly plan', () => {
    const q = commitment({ frequency: 'quarterly', installmentsTotal: 3, startMonth: 11 });
    expect(isDueInPeriod(q, { year: 2026, month: 12 })).toBe(false);
    expect(isDueInPeriod(q, { year: 2027, month: 2 })).toBe(true);
  });

  it('aligns on the 6-month rhythm for a semiannual plan', () => {
    const s = commitment({
      frequency: 'semiannual',
      installmentsTotal: 3,
      startYear: 2026,
      startMonth: 2,
    });
    expect(isDueInPeriod(s, { year: 2026, month: 2 })).toBe(true);
    expect(isDueInPeriod(s, { year: 2026, month: 8 })).toBe(true);
    expect(isDueInPeriod(s, { year: 2027, month: 2 })).toBe(true);
    expect(isDueInPeriod(s, { year: 2026, month: 7 })).toBe(false);
    expect(isDueInPeriod(s, { year: 2027, month: 8 })).toBe(false); // past the 3rd
  });

  it('aligns on the same month each year for an annual plan', () => {
    const a = commitment({
      frequency: 'annual',
      installmentsTotal: 3,
      startYear: 2026,
      startMonth: 11,
    });
    expect(isDueInPeriod(a, { year: 2027, month: 11 })).toBe(true);
    expect(isDueInPeriod(a, { year: 2026, month: 10 })).toBe(false);
    expect(isDueInPeriod(a, { year: 2026, month: 12 })).toBe(false);
  });

  // The direct-arithmetic implementation must stay equivalent to the schedule
  // it replaced (Sourcery #233 perf note): scan a 4-year window and compare.
  it('matches installmentPeriods() exactly across every cadence (equivalence lock)', () => {
    const cadences = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
    for (const frequency of cadences) {
      const c = commitment({ frequency, installmentsTotal: 5, startYear: 2026, startMonth: 5 });
      const scheduled = new Set(installmentPeriods(c).map((p) => `${p.year}-${p.month}`));
      for (let y = 2025; y <= 2032; y += 1) {
        for (let m = 1; m <= 12; m += 1) {
          expect(isDueInPeriod(c, { year: y, month: m })).toBe(scheduled.has(`${y}-${m}`));
        }
      }
    }
  });
});

describe('installmentAmountOf', () => {
  it('returns the instalment amount for a multi-instalment commitment', () => {
    expect(installmentAmountOf(commitment())).toBe(250);
  });

  it('falls back to the total for a one-off (no instalment amount stored)', () => {
    expect(
      installmentAmountOf(
        commitment({
          kind: 'one_off',
          installmentsTotal: 1,
          installmentAmount: null,
          totalAmount: 340,
        }),
      ),
    ).toBe(340);
  });
});

describe('remainingBalance / installmentsPaid / isFinished', () => {
  const c = commitment({ installmentsTotal: 3, startYear: 2026, startMonth: 11, totalAmount: 750 });

  it('starts at the full engaged amount', () => {
    expect(remainingBalance(c, paidSet([]))).toBe(750);
    expect(installmentsPaid(c, paidSet([]))).toBe(0);
    expect(isFinished(c, paidSet([]))).toBe(false);
  });

  it('decreases by one instalment per ticked period', () => {
    expect(remainingBalance(c, paidSet([[2026, 11]]))).toBe(500);
    expect(installmentsPaid(c, paidSet([[2026, 11]]))).toBe(1);
  });

  it('lands on exactly 0 and reports finished when every instalment is ticked', () => {
    const all = paidSet([
      [2026, 11],
      [2026, 12],
      [2027, 1],
    ]);
    expect(remainingBalance(c, all)).toBe(0);
    expect(installmentsPaid(c, all)).toBe(3);
    expect(isFinished(c, all)).toBe(true);
  });

  it('ignores a ledger tick from BEFORE the schedule starts', () => {
    // Anchor is Nov 2026; a stray Oct 2026 tick must not count as progress.
    const stray = paidSet([
      [2026, 10],
      [2026, 11],
    ]);
    expect(installmentsPaid(c, stray)).toBe(1);
    expect(remainingBalance(c, stray)).toBe(500);
  });

  it('never goes negative, even if the ledger holds an off-schedule tick', () => {
    const noisy = paidSet([
      [2026, 11],
      [2026, 12],
      [2027, 1],
      [2027, 6], // not part of the schedule
    ]);
    expect(remainingBalance(c, noisy)).toBe(0);
    expect(installmentsPaid(c, noisy)).toBe(3);
  });

  it('handles a rounding remainder on the final instalment', () => {
    // 100 € over 3 × 33.33 → the last instalment absorbs the 0.01 remainder.
    const r = commitment({ totalAmount: 100, installmentAmount: 33.33, installmentsTotal: 3 });
    const two = paidSet([
      [2026, 8],
      [2026, 9],
    ]);
    expect(remainingBalance(r, two)).toBeCloseTo(33.34, 2);
    expect(
      remainingBalance(
        r,
        paidSet([
          [2026, 8],
          [2026, 9],
          [2026, 10],
        ]),
      ),
    ).toBe(0);
  });
});
