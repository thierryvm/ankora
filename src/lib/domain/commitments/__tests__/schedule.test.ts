import { describe, it, expect } from 'vitest';

import {
  endInstallmentDate,
  endOrdinal,
  endPeriod,
  firstInstallmentDate,
  hasExplicitPaymentDay,
  hasIrregularFinalInstallment,
  installmentAmountAt,
  installmentDate,
  installmentPeriods,
  isDueInPeriod,
  installmentAmountOf,
  lastInstallmentAmount,
  nextDuePeriod,
  periodOrdinal,
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
    // Decimal makes it exact: 100 − 2 × 33.33 is 33.34, not 33.340000000000003.
    const r = commitment({ totalAmount: 100, installmentAmount: 33.33, installmentsTotal: 3 });
    expect(remainingBalance(r, paidSet([[2026, 9]]))).toBe(66.67);
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

// ---------------------------------------------------------------------------
// The real « SPF impôt » case that started this (reported 2026-08-02)
// ---------------------------------------------------------------------------
//
// 2 407,93 € over 11 monthly instalments from 15/05/2026: 10 × 220 € then a
// 207,93 € residue, 4 ticked. The app announced « 11 échéances de 220 €,
// dernière en Mai 2027 » — two months late and a wrong amount, because the
// stored anchor was the CREATION month (July) and the final instalment was
// never derived.
describe('SPF impôt — the reported case, end to end', () => {
  const spf = commitment({
    kind: 'installment_plan',
    totalAmount: 2407.93,
    installmentAmount: 220,
    installmentsTotal: 11,
    startYear: 2026,
    startMonth: 5,
    paymentDay: 15,
  });

  const fourPaid = paidSet([
    [2026, 5],
    [2026, 6],
    [2026, 7],
    [2026, 8],
  ]);

  it('ends in March 2027 — first + (total − 1) periods, never first + total', () => {
    expect(endPeriod(spf)).toEqual({ year: 2027, month: 3 });
  });

  it('dates the last instalment on 15 March 2027', () => {
    expect(endInstallmentDate(spf)).toEqual({ year: 2027, month: 3, day: 15 });
  });

  it('starts on the anchor itself — instalment n°1 carries no offset', () => {
    expect(firstInstallmentDate(spf)).toEqual({ year: 2026, month: 5, day: 15 });
    expect(installmentPeriods(spf)[0]).toEqual({ year: 2026, month: 5 });
  });

  it('derives a 207,93 € final instalment, exactly (native floats do not)', () => {
    expect(lastInstallmentAmount(spf)).toBe(207.93);
    expect(2407.93 - 10 * 220).not.toBe(207.93); // the float trap this guards
  });

  it('flags the plan as having an irregular final instalment', () => {
    expect(hasIrregularFinalInstallment(spf)).toBe(true);
    expect(installmentAmountAt(spf, 0)).toBe(220);
    expect(installmentAmountAt(spf, 9)).toBe(220);
    expect(installmentAmountAt(spf, 10)).toBe(207.93);
  });

  it('reports 1 527,93 € still owed after the 4 ticked instalments', () => {
    expect(installmentsPaid(spf, fourPaid)).toBe(4);
    expect(remainingBalance(spf, fourPaid)).toBe(1527.93);
  });

  it('points the next instalment at September 2026 — first + 4 periods', () => {
    expect(nextDuePeriod(spf, fourPaid)).toEqual({ year: 2026, month: 9 });
  });

  it('lands on exactly zero — the residue closes the plan, not a leftover cent', () => {
    const all = paidSet(installmentPeriods(spf).map((p): [number, number] => [p.year, p.month]));
    expect(installmentsPaid(spf, all)).toBe(11);
    expect(remainingBalance(spf, all)).toBe(0);
    expect(nextDuePeriod(spf, all)).toBeNull();
    expect(isFinished(spf, all)).toBe(true);
  });
});

describe('single-instalment plan', () => {
  const single = commitment({ installmentsTotal: 1, totalAmount: 340, installmentAmount: 340 });

  it('ends where it starts — last = first', () => {
    expect(endPeriod(single)).toEqual({ year: 2026, month: 8 });
    expect(endInstallmentDate(single)).toEqual(firstInstallmentDate(single));
  });

  it('has no irregular final instalment to announce', () => {
    expect(hasIrregularFinalInstallment(single)).toBe(false);
    expect(lastInstallmentAmount(single)).toBe(340);
  });

  it('is settled by its single tick', () => {
    const paid = paidSet([[2026, 8]]);
    expect(remainingBalance(single, paid)).toBe(0);
    expect(nextDuePeriod(single, paid)).toBeNull();
  });

  it('falls back to the total for a one-off with no instalment amount', () => {
    const oneOff = commitment({
      kind: 'one_off',
      installmentsTotal: 1,
      installmentAmount: null,
      totalAmount: 340,
    });
    expect(lastInstallmentAmount(oneOff)).toBe(340);
    expect(hasIrregularFinalInstallment(oneOff)).toBe(false);
  });
});

describe('year boundaries', () => {
  it('crosses one new year (Nov 2026 + 3 monthly → Jan 2027)', () => {
    expect(
      endPeriod(commitment({ installmentsTotal: 3, startYear: 2026, startMonth: 11 })),
    ).toEqual({ year: 2027, month: 1 });
  });

  it('crosses several, December anchor included (Dec 2026 + 25 monthly → Dec 2028)', () => {
    const c = commitment({ installmentsTotal: 25, startYear: 2026, startMonth: 12 });
    expect(endPeriod(c)).toEqual({ year: 2028, month: 12 });
    expect(installmentPeriods(c)[1]).toEqual({ year: 2027, month: 1 });
  });

  it('keeps ordinal arithmetic reversible across a boundary', () => {
    expect(periodOrdinal(2027, 1) - periodOrdinal(2026, 12)).toBe(1);
  });
});

describe('end-of-month clamping', () => {
  it('never spills a 31st into the next month (31 Jan + 1 month = 28 Feb, not 3 Mar)', () => {
    const c = commitment({ startYear: 2026, startMonth: 1, paymentDay: 31, installmentsTotal: 3 });
    expect(installmentDate(c, 0)).toEqual({ year: 2026, month: 1, day: 31 });
    expect(installmentDate(c, 1)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(installmentDate(c, 2)).toEqual({ year: 2026, month: 3, day: 31 });
  });

  it('honours a leap February', () => {
    const c = commitment({ startYear: 2028, startMonth: 2, paymentDay: 31 });
    expect(installmentDate(c, 0)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('clamps a 30th only in February', () => {
    const c = commitment({ startYear: 2026, startMonth: 2, paymentDay: 30, installmentsTotal: 3 });
    expect(installmentDate(c, 0).day).toBe(28);
    expect(installmentDate(c, 1).day).toBe(30); // March
    expect(installmentDate(c, 2).day).toBe(30); // April
  });

  it('reports no day at all when the payment day was never chosen', () => {
    // `payment_day` defaults to 1 in SQL and was hard-coded to 1 by the old
    // form: rendering it would show a made-up date on every existing row.
    const c = commitment({ paymentDay: 1 });
    expect(hasExplicitPaymentDay(c)).toBe(false);
    expect(installmentDate(c, 0)).toEqual({ year: 2026, month: 8, day: null });
  });
});

describe('a settled plan never shows a negative remainder', () => {
  it('reads exactly 0 when every instalment is ticked, residue included', () => {
    const c = commitment({ totalAmount: 2407.93, installmentAmount: 220, installmentsTotal: 11 });
    const all = paidSet(installmentPeriods(c).map((p): [number, number] => [p.year, p.month]));
    expect(remainingBalance(c, all)).toBe(0);
    expect(isFinished(c, all)).toBe(true);
  });

  it('reads 0, not a negative, on an OVER-specified plan (instalments > total)', () => {
    // 5 × 250 = 1 250 € declared against a 1 000 € total: the residue is
    // negative on paper. Neither the balance nor the final instalment may be.
    const over = commitment({ totalAmount: 1000, installmentAmount: 250, installmentsTotal: 5 });
    expect(lastInstallmentAmount(over)).toBe(0);
    const four = paidSet([
      [2026, 8],
      [2026, 9],
      [2026, 10],
      [2026, 11],
    ]);
    expect(remainingBalance(over, four)).toBe(0);
    expect(remainingBalance(over, paidSet([[2026, 8]]))).toBe(750);
  });
});

describe('endOrdinal — the single upper bound the cockpit consumes', () => {
  it('equals the ordinal of the last scheduled period, for every cadence', () => {
    for (const frequency of ['monthly', 'quarterly', 'semiannual', 'annual'] as const) {
      const c = commitment({ frequency, installmentsTotal: 7, startYear: 2026, startMonth: 5 });
      const last = endPeriod(c);
      expect(endOrdinal(c)).toBe(periodOrdinal(last.year, last.month));
    }
  });

  it('equals the anchor for a single instalment (no phantom cycle)', () => {
    const c = commitment({ installmentsTotal: 1, startYear: 2026, startMonth: 5 });
    expect(endOrdinal(c)).toBe(periodOrdinal(2026, 5));
  });
});
