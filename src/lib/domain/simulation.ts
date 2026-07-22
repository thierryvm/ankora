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
};

/**
 * Estimate the monthly-savings impact of a what-if action.
 * Pure function — does not mutate input charges.
 *
 * Note: `currentMonthlyProvision` is the smoothed monthly effort
 * (`monthlyProvisionTotal`), provably equal to the cockpit's
 * `effortFinancierLisse` for the same charges — see the equivalence test in
 * `simulation.test.ts`. The "Actuel" shown by the simulator therefore matches
 * the dashboard's "Effort lissé" (anchoring, THI-195 audit §2).
 */
export function simulate(charges: readonly Charge[], input: SimulationInput): SimulationResult {
  const current = monthlyProvisionTotal(charges);
  const projected = computeProjected(charges, input);

  const monthlyDelta = current.minus(projected);
  const annualDelta = monthlyDelta.times(12);

  return {
    currentMonthlyProvision: current,
    projectedMonthlyProvision: projected,
    monthlyDelta,
    annualDelta,
  };
}

/**
 * "Reste disponible" (réserve libre) view of a simulation — the signature
 * metric of Ankora. THI-195 reframes the simulator on this (not on the raw
 * "effort"/total charges) so the user sees the impact on the same number the
 * cockpit hero shows.
 *
 *   resteDisponible = revenus − monthlyProvision − engagements
 *                     (== revenus − effortFinancierLisse − engagements)
 *
 * `engagements` is the smoothed monthly burden of the active commitments
 * (ADR-021): the hero deducts it, so the simulator MUST too, otherwise the two
 * surfaces disagree by `engagements` whenever a debt is running. It is constant
 * across the what-if action (which only touches charges), so it lowers `current`
 * and `projected` equally and leaves `monthlyDelta` invariant.
 *
 * `monthlyDelta` is invariant under both the revenus shift and the engagements
 * shift (they cancel), so the projected/current gap equals `simulate(...).monthlyDelta`.
 *
 * Pure — no clamping. If `revenus` is 0 (income not configured), `current` is
 * negative and the UI layer is responsible for the messaging.
 */
export type ResteDisponibleView = {
  current: Money;
  projected: Money;
  monthlyDelta: Money;
};

export function resteDisponibleView(
  revenus: Money,
  result: SimulationResult,
  engagements: Money = zero(),
): ResteDisponibleView {
  return {
    current: revenus.minus(result.currentMonthlyProvision).minus(engagements),
    projected: revenus.minus(result.projectedMonthlyProvision).minus(engagements),
    monthlyDelta: result.monthlyDelta,
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

/**
 * Cumulative réserve-libre série over `months` for the simulator's 6-month
 * projection (Track B P1 — "marginal model" locked 2026-05-30 with @thierry).
 *
 * Point at index `i` (0-based) is the cumulative saving banked after month
 * `i + 1`, i.e. `monthlyDelta × (i + 1)` (delegated to `projectCumulative`).
 * The curve's "Avec ce choix" line; "Sans changement" is the flat 0 baseline.
 * Sign is preserved — a negative delta (e.g. adding a charge) yields a
 * descending série (cumulative loss of réserve libre).
 *
 * Pure. Consumed CLIENT-SIDE only (SimulatorProjection) — the returned
 * `Money[]` (Decimal) must never be serialised across the RSC boundary; the
 * client computes it from a `monthlyDelta` already living in the browser.
 */
export function cumulativeReserveSeries(monthlyDelta: Money, months: number): Money[] {
  if (months < 0) throw new RangeError('months must be >= 0');
  return Array.from({ length: months }, (_, i) => projectCumulative(monthlyDelta, i + 1));
}

export const simulationHelpers = { money, zero };
