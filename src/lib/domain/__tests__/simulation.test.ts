import { describe, it, expect } from 'vitest';
import { money } from '@/lib/domain/types';
import { simulate, projectCumulative, resteDisponibleView } from '@/lib/domain/simulation';
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
