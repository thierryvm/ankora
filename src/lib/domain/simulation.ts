import { money, zero, type Charge, type Money } from '@/lib/domain/types';
import { monthlyProvisionFor, monthlyProvisionTotal } from '@/lib/domain/budget';

export type SimulationInput =
  | { kind: 'cancel'; chargeId: string }
  | { kind: 'negotiate'; chargeId: string; newAmount: Money }
  | { kind: 'add'; charge: Omit<Charge, 'id'> };

export type SimulationResult = {
  currentMonthlyProvision: Money;
  projectedMonthlyProvision: Money;
  monthlyDelta: Money;
  annualDelta: Money;
  /** Percent change, rounded to 2 decimals. */
  changePercent: number;
};

/**
 * Estimate the monthly-savings impact of a what-if action.
 * Pure function — does not mutate input charges.
 */
export function simulate(charges: readonly Charge[], input: SimulationInput): SimulationResult {
  const current = monthlyProvisionTotal(charges);
  const projected = computeProjected(charges, input);

  const monthlyDelta = current.minus(projected);
  const annualDelta = monthlyDelta.times(12);

  const changePercent = current.isZero()
    ? 0
    : Number(monthlyDelta.div(current).times(100).toFixed(2));

  return {
    currentMonthlyProvision: current,
    projectedMonthlyProvision: projected,
    monthlyDelta,
    annualDelta,
    changePercent,
  };
}

function computeProjected(charges: readonly Charge[], input: SimulationInput): Money {
  switch (input.kind) {
    case 'cancel': {
      const target = charges.find((c) => c.id === input.chargeId);
      if (!target) return monthlyProvisionTotal(charges);
      return monthlyProvisionTotal(charges).minus(monthlyProvisionFor(target));
    }
    case 'negotiate': {
      if (input.newAmount.lt(0)) throw new RangeError('newAmount must be >= 0');
      const patched = charges.map((c) =>
        c.id === input.chargeId ? { ...c, amount: input.newAmount } : c,
      );
      return monthlyProvisionTotal(patched);
    }
    case 'add': {
      if (input.charge.amount.lt(0)) throw new RangeError('charge.amount must be >= 0');
      const synthetic: Charge = { ...input.charge, id: '__sim__' };
      return monthlyProvisionTotal([...charges, synthetic]);
    }
  }
}

/**
 * Cumulative projected savings after N months given a monthly delta.
 * Use for "what if I negotiate my internet bill down to 30€?" multi-month projections.
 */
export function projectCumulative(monthlyDelta: Money, months: number): Money {
  if (months < 0) throw new RangeError('months must be >= 0');
  if (monthlyDelta.isZero() || months === 0) return zero();
  return monthlyDelta.times(months);
}

export const simulationHelpers = { money, zero };
