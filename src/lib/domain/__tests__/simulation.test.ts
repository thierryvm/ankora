import { describe, it, expect } from 'vitest';
import { money } from '@/lib/domain/types';
import { simulate, projectCumulative } from '@/lib/domain/simulation';
import type { Charge } from '@/lib/domain/types';

const charges: Charge[] = [
  {
    id: 'c1',
    label: 'Internet',
    amount: money(50),
    frequency: 'monthly',
    dueMonth: 1,
    categoryId: null,
    isActive: true,
  },
  {
    id: 'c2',
    label: 'Assurance',
    amount: money(1200),
    frequency: 'annual',
    dueMonth: 3,
    categoryId: null,
    isActive: true,
  },
];
// Monthly provision = 50 + 100 = 150

describe('simulate / cancel', () => {
  it('projects provisioning after cancelling a monthly charge', () => {
    const result = simulate(charges, { kind: 'cancel', chargeId: 'c1' });
    expect(result.projectedMonthlyProvision.toNumber()).toBe(100);
    expect(result.monthlyDelta.toNumber()).toBe(50);
    expect(result.annualDelta.toNumber()).toBe(600);
    expect(result.changePercent).toBeCloseTo((50 / 150) * 100, 2);
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
        categoryId: null,
        isActive: true,
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
          categoryId: null,
          isActive: true,
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
