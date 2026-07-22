import { describe, it, expect } from 'vitest';
import { money } from '@/lib/domain/types';
import {
  simulate,
  projectCumulative,
  cumulativeReserveSeries,
  resteDisponibleView,
} from '@/lib/domain/simulation';
import { monthlyProvisionTotal } from '@/lib/domain/budget';
import { effortFinancierLisse } from '@/lib/domain/cockpit/effort-financier-lisse';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';
import type { Charge } from '@/lib/domain/types';

/**
 * Maps a domain `Charge` to the cockpit `CockpitCharge` shape, locally so the
 * test stays free of the DB-bound `toCockpitCharges` snapshot helper.
 */
function toCockpit(c: Charge): CockpitCharge {
  return {
    id: c.id,
    label: c.label,
    amount: c.amount,
    frequency: c.frequency,
    paymentMonths: c.paymentMonths,
    paymentDay: c.paymentDay,
    isActive: c.isActive,
  };
}

const charges: Charge[] = [
  {
    id: 'c1',
    label: 'Internet',
    amount: money(50),
    frequency: 'monthly',
    dueMonth: 1,
    paymentMonths: [1],
    paymentDay: 1,
    categoryId: null,
    isActive: true,
    paidFrom: 'principal',
  },
  {
    id: 'c2',
    label: 'Assurance',
    amount: money(1200),
    frequency: 'annual',
    dueMonth: 3,
    paymentMonths: [3],
    paymentDay: 1,
    categoryId: null,
    isActive: true,
    paidFrom: 'principal',
  },
];
// Monthly provision = 50 + 100 = 150

describe('simulate / cancel', () => {
  it('projects provisioning after cancelling a monthly charge', () => {
    const result = simulate(charges, { kind: 'cancel', chargeId: 'c1' });
    expect(result.projectedMonthlyProvision.toNumber()).toBe(100);
    expect(result.monthlyDelta.toNumber()).toBe(50);
    expect(result.annualDelta.toNumber()).toBe(600);
  });

  it('returns no change if chargeId is unknown', () => {
    const result = simulate(charges, { kind: 'cancel', chargeId: 'missing' });
    expect(result.monthlyDelta.toNumber()).toBe(0);
  });
});

describe('simulate / negotiate', () => {
  it('projects impact of lowering a monthly charge', () => {
    const result = simulate(charges, { kind: 'negotiate', chargeId: 'c1', newAmount: money(30) });
    expect(result.projectedMonthlyProvision.toNumber()).toBe(130);
    expect(result.monthlyDelta.toNumber()).toBe(20);
  });

  it('handles negotiating to a higher amount (negative delta)', () => {
    const result = simulate(charges, { kind: 'negotiate', chargeId: 'c1', newAmount: money(80) });
    expect(result.monthlyDelta.toNumber()).toBe(-30);
  });

  it('rejects negative amounts', () => {
    expect(() =>
      simulate(charges, { kind: 'negotiate', chargeId: 'c1', newAmount: money(-1) }),
    ).toThrow(RangeError);
  });
});

describe('simulate / add', () => {
  it('adds a new charge to projection', () => {
    const result = simulate(charges, {
      kind: 'add',
      charge: {
        label: 'Streaming',
        amount: money(15),
        frequency: 'monthly',
        dueMonth: 1,
        paymentMonths: [1],
        paymentDay: 1,
        categoryId: null,
        isActive: true,
        paidFrom: 'principal',
      },
    });
    expect(result.projectedMonthlyProvision.toNumber()).toBe(165);
    expect(result.monthlyDelta.toNumber()).toBe(-15);
  });

  it('rejects negative amounts', () => {
    expect(() =>
      simulate(charges, {
        kind: 'add',
        charge: {
          label: 'Bad',
          amount: money(-5),
          frequency: 'monthly',
          dueMonth: 1,
          paymentMonths: [1],
          paymentDay: 1,
          categoryId: null,
          isActive: true,
          paidFrom: 'principal',
        },
      }),
    ).toThrow(RangeError);
  });
});

describe('projectCumulative', () => {
  it('projects monthly savings over N months', () => {
    expect(projectCumulative(money(20), 6).toNumber()).toBe(120);
  });
  it('returns zero for zero delta', () => {
    expect(projectCumulative(money(0), 12).toNumber()).toBe(0);
  });
  it('returns zero for zero months', () => {
    expect(projectCumulative(money(50), 0).toNumber()).toBe(0);
  });
  it('rejects negative months', () => {
    expect(() => projectCumulative(money(10), -1)).toThrow(RangeError);
  });
});

describe('cumulativeReserveSeries (S3 projection 6 mois — marginal model)', () => {
  it('builds the cumulative série: point m (1-based) = monthlyDelta × m', () => {
    const series = cumulativeReserveSeries(money(20), 6);
    expect(series.map((m) => m.toNumber())).toEqual([20, 40, 60, 80, 100, 120]);
  });

  it('preserves sign for a negative delta (e.g. adding a charge → descending)', () => {
    const series = cumulativeReserveSeries(money(-15), 6);
    expect(series.map((m) => m.toNumber())).toEqual([-15, -30, -45, -60, -75, -90]);
  });

  it('returns an all-zero série for a zero delta', () => {
    const series = cumulativeReserveSeries(money(0), 6);
    expect(series.every((m) => m.isZero())).toBe(true);
    expect(series).toHaveLength(6);
  });

  it('returns an empty série for zero months', () => {
    expect(cumulativeReserveSeries(money(50), 0)).toEqual([]);
  });

  it('rejects negative months', () => {
    expect(() => cumulativeReserveSeries(money(10), -1)).toThrow(RangeError);
  });

  // Oracle lock (plan-reviewer point 4): the displayed S4 cumul (series[last])
  // must never diverge from the canonical projectCumulative — guards against a
  // future refactor of either changing one without the other.
  it('last point equals projectCumulative(monthlyDelta, months)', () => {
    const series = cumulativeReserveSeries(money(33.5), 6);
    expect(series[5]!.eq(projectCumulative(money(33.5), 6))).toBe(true);
  });

  // RSC-boundary regression (#202 class): built from a re-wrapped money(number)
  // exactly like the client does — every point stays a finite Decimal, no
  // prototype loss masquerading as NaN.
  it('stays finite when built from a re-wrapped money(number)', () => {
    const delta = money(Number('18.40')); // mimics client re-wrap of a plain number
    const series = cumulativeReserveSeries(delta, 6);
    expect(series).toHaveLength(6);
    expect(series.every((m) => Number.isFinite(m.toNumber()))).toBe(true);
    expect(series[5]!.toNumber()).toBeCloseTo(110.4, 10);
  });
});

describe('resteDisponibleView (réserve libre = revenus − effort lissé)', () => {
  it('raises reste disponible when a charge is cancelled', () => {
    const result = simulate(charges, { kind: 'cancel', chargeId: 'c1' });
    const view = resteDisponibleView(money(2000), result);
    // current = 2000 − 150 ; projected = 2000 − 100 (50 freed)
    expect(view.current.toNumber()).toBe(1850);
    expect(view.projected.toNumber()).toBe(1900);
    expect(view.projected.gt(view.current)).toBe(true);
    expect(view.monthlyDelta.toNumber()).toBe(50);
  });

  it('shifts reste disponible by the negotiated monthly gap', () => {
    const result = simulate(charges, { kind: 'negotiate', chargeId: 'c1', newAmount: money(30) });
    const view = resteDisponibleView(money(2000), result);
    // 50 → 30 on a monthly charge frees 20/month of reste disponible.
    expect(view.projected.minus(view.current).toNumber()).toBe(20);
  });

  it('lowers reste disponible when a charge is added', () => {
    const result = simulate(charges, {
      kind: 'add',
      charge: {
        label: 'Streaming',
        amount: money(15),
        frequency: 'monthly',
        dueMonth: 1,
        paymentMonths: [1],
        paymentDay: 1,
        categoryId: null,
        isActive: true,
        paidFrom: 'principal',
      },
    });
    const view = resteDisponibleView(money(2000), result);
    expect(view.projected.lt(view.current)).toBe(true);
    expect(view.monthlyDelta.toNumber()).toBe(-15);
  });

  it('returns negative reste disponible when revenus is 0 (income not configured)', () => {
    const result = simulate(charges, { kind: 'cancel', chargeId: 'c1' });
    const view = resteDisponibleView(money(0), result);
    // No clamping: −150 → −100. The UI layer surfaces the "configure income" hint.
    expect(view.current.toNumber()).toBe(-150);
    expect(view.projected.toNumber()).toBe(-100);
  });

  it('keeps monthlyDelta invariant under the revenus shift', () => {
    const result = simulate(charges, { kind: 'cancel', chargeId: 'c1' });
    expect(resteDisponibleView(money(2000), result).monthlyDelta.toNumber()).toBe(
      result.monthlyDelta.toNumber(),
    );
  });

  it('ADR-021: engagements lower both sides equally, monthlyDelta unchanged', () => {
    const result = simulate(charges, { kind: 'cancel', chargeId: 'c1' });
    const view = resteDisponibleView(money(2000), result, money(250));
    // current = 2000 − 150 − 250 ; projected = 2000 − 100 − 250
    expect(view.current.toNumber()).toBe(1600);
    expect(view.projected.toNumber()).toBe(1650);
    expect(view.monthlyDelta.toNumber()).toBe(50); // engagements cancel in the gap
  });

  it('ADR-021 anti-drift: simulator baseline equals the hero reste disponible', () => {
    const engagements = money(250);
    const result = simulate(charges, { kind: 'cancel', chargeId: 'c1' });
    const simulatorBaseline = resteDisponibleView(money(2000), result, engagements).current;
    // Hero reste disponible = revenus − effortFinancierLisse − engagements, and
    // monthlyProvisionTotal ≡ effortFinancierLisse (anchoring below), so the two
    // surfaces must land on the exact same number — no drift.
    const heroReste = money(2000)
      .minus(effortFinancierLisse(charges.map(toCockpit)))
      .minus(engagements);
    expect(simulatorBaseline.toNumber()).toBeCloseTo(heroReste.toNumber(), 10);
  });
});

describe('anchoring (D3) — monthlyProvisionTotal ≡ effortFinancierLisse', () => {
  it('matches for the mixed monthly + annual fixture', () => {
    const budget = monthlyProvisionTotal(charges);
    const cockpit = effortFinancierLisse(charges.map(toCockpit));
    expect(budget.toNumber()).toBeCloseTo(cockpit.toNumber(), 10);
  });

  it('matches across every frequency, including inactive charges', () => {
    const mixed: Charge[] = [
      { ...charges[0]!, id: 'm', amount: money(53), frequency: 'monthly' },
      { ...charges[0]!, id: 'q', amount: money(90), frequency: 'quarterly' },
      { ...charges[0]!, id: 's', amount: money(120), frequency: 'semiannual' },
      { ...charges[0]!, id: 'a', amount: money(1200), frequency: 'annual' },
      { ...charges[0]!, id: 'x', amount: money(999), frequency: 'monthly', isActive: false },
    ];
    const budget = monthlyProvisionTotal(mixed);
    const cockpit = effortFinancierLisse(mixed.map(toCockpit));
    expect(budget.toNumber()).toBeCloseTo(cockpit.toNumber(), 10);
  });
});
