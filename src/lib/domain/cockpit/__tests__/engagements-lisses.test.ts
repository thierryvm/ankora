import { describe, expect, it } from 'vitest';

import type { Commitment } from '../../commitments';
import { periodKey } from '../../commitments';
import { engagementPeseSurMois, engagementsMensuelsLisses } from '../engagements-lisses';

/**
 * Base = car loan: 250 €/month, 17 instalments, anchored Jan 2026.
 * `startYear/startMonth` is the NEXT instalment (decision D3), so the schedule
 * runs Jan 2026 → May 2027.
 */
const carLoan: Commitment = {
  id: 'car',
  kind: 'debt',
  totalAmount: 4250,
  installmentAmount: 250,
  installmentsTotal: 17,
  startYear: 2026,
  startMonth: 1,
  paymentDay: 15,
  frequency: 'monthly',
  isActive: true,
};

/** SPF arrangement: 600 €/quarter, 4 instalments, anchored Jan 2026 → Oct 2026. */
const quarterly: Commitment = {
  id: 'spf',
  kind: 'installment_plan',
  totalAmount: 2400,
  installmentAmount: 600,
  installmentsTotal: 4,
  startYear: 2026,
  startMonth: 1,
  paymentDay: 20,
  frequency: 'quarterly',
  isActive: true,
};

const ledger = (c: Commitment, keys: string[]): ReadonlyMap<string, ReadonlySet<string>> =>
  new Map([[c.id, new Set(keys)]]);

describe('engagementPeseSurMois', () => {
  it('counts a monthly instalment plan within its window', () => {
    expect(engagementPeseSurMois(carLoan, new Set(), { year: 2026, month: 3 })).toBe(true);
  });

  it('excludes a one-off (installmentsTotal === 1) even when due this month', () => {
    const oneOff: Commitment = {
      ...carLoan,
      id: 'boiler',
      kind: 'one_off',
      totalAmount: 340,
      installmentAmount: null,
      installmentsTotal: 1,
      startMonth: 3,
    };
    expect(engagementPeseSurMois(oneOff, new Set(), { year: 2026, month: 3 })).toBe(false);
  });

  it('excludes a single-instalment non-monthly debt (would otherwise smooth 1200/12)', () => {
    const single: Commitment = {
      ...carLoan,
      id: 'lump',
      kind: 'debt',
      totalAmount: 1200,
      installmentAmount: null,
      installmentsTotal: 1,
      frequency: 'annual',
      startMonth: 3,
    };
    expect(engagementPeseSurMois(single, new Set(), { year: 2026, month: 3 })).toBe(false);
  });

  it('is false before the first instalment (future commitment)', () => {
    expect(engagementPeseSurMois(carLoan, new Set(), { year: 2025, month: 12 })).toBe(false);
  });

  it('is false the month after the last instalment (window closed)', () => {
    // Quarterly, 4 instalments from Jan 2026: last is Oct 2026 → Nov 2026 is out.
    expect(engagementPeseSurMois(quarterly, new Set(), { year: 2026, month: 11 })).toBe(false);
  });

  it('is false once every instalment is ticked (settled early)', () => {
    const allTicked = ['2026-1', '2026-4', '2026-7', '2026-10'];
    expect(engagementPeseSurMois(quarterly, new Set(allTicked), { year: 2026, month: 4 })).toBe(
      false,
    );
  });

  it('is false for an inactive commitment', () => {
    expect(
      engagementPeseSurMois({ ...carLoan, isActive: false }, new Set(), {
        year: 2026,
        month: 3,
      }),
    ).toBe(false);
  });
});

describe('engagementsMensuelsLisses', () => {
  it('smooths a monthly instalment at its face value', () => {
    const total = engagementsMensuelsLisses([carLoan], ledger(carLoan, []), {
      year: 2026,
      month: 3,
    });
    expect(total.toNumber()).toBe(250);
  });

  it('smooths a quarterly instalment across its cycle (600 / 3 = 200)', () => {
    const total = engagementsMensuelsLisses([quarterly], ledger(quarterly, []), {
      year: 2026,
      month: 4,
    });
    expect(total.toNumber()).toBe(200);
  });

  it('quarterly weighs 200 on each of its 4 instalments and 0 the month after', () => {
    const dues = [
      { year: 2026, month: 1 },
      { year: 2026, month: 4 },
      { year: 2026, month: 7 },
      { year: 2026, month: 10 },
    ];
    for (const ref of dues) {
      expect(engagementsMensuelsLisses([quarterly], ledger(quarterly, []), ref).toNumber()).toBe(
        200,
      );
    }
    expect(
      engagementsMensuelsLisses([quarterly], ledger(quarterly, []), {
        year: 2027,
        month: 1,
      }).toNumber(),
    ).toBe(0);
  });

  it('aggregates several active commitments (250 monthly + 200 quarterly = 450)', () => {
    const total = engagementsMensuelsLisses(
      [carLoan, quarterly],
      new Map([
        [carLoan.id, new Set<string>()],
        [quarterly.id, new Set<string>()],
      ]),
      { year: 2026, month: 4 },
    );
    expect(total.toNumber()).toBe(450);
  });

  it('treats a missing ledger entry as unticked without crashing', () => {
    const total = engagementsMensuelsLisses(
      [carLoan],
      new Map(), // no entry for `car`
      { year: 2026, month: 3 },
    );
    expect(total.toNumber()).toBe(250);
  });

  it('returns 0 when a commitment is fully ticked', () => {
    const allTicked = Array.from({ length: 17 }, (_, i) => {
      const month = ((carLoan.startMonth - 1 + i) % 12) + 1;
      const year = carLoan.startYear + Math.floor((carLoan.startMonth - 1 + i) / 12);
      return periodKey(year, month);
    });
    const total = engagementsMensuelsLisses([carLoan], ledger(carLoan, allTicked), {
      year: 2026,
      month: 3,
    });
    expect(total.toNumber()).toBe(0);
  });
});
