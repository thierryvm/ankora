import Decimal from 'decimal.js';

import { CYCLE_MONTHS, monthlyCharges, periodicCharges, type CockpitCharge } from './types';

/**
 * Sum of every active monthly charge.
 * Inactive charges are ignored (they don't impact the cockpit).
 */
export function totalChargesMensuelles(charges: readonly CockpitCharge[]): Decimal {
  return monthlyCharges(charges).reduce((acc, c) => acc.plus(c.amount), new Decimal(0));
}

/**
 * Sum of the monthly equivalent of every active periodic charge.
 *  annual     → amount / 12
 *  semiannual → amount / 6
 *  quarterly  → amount / 3
 *  monthly    → 0  (already counted in `totalChargesMensuelles`)
 *
 * Decimal precision is preserved internally; rounding is the UI layer's job.
 */
export function provisionsMensuellesLissees(charges: readonly CockpitCharge[]): Decimal {
  return periodicCharges(charges).reduce(
    (acc, c) => acc.plus(c.amount.dividedBy(CYCLE_MONTHS[c.frequency])),
    new Decimal(0),
  );
}

/**
 * Effort Financier Lissé (ADR-009) =
 *   Σ charges mensuelles + Σ provisions mensuelles lissées
 *
 * Cf. spec dashboard-cockpit-vraie-vision-2026-05-03 §1.
 * This is what the user "really" pays each month once you smooth out the
 * periodic bills. It's the input to `capaciteEpargneReelle`.
 */
export function effortFinancierLisse(charges: readonly CockpitCharge[]): Decimal {
  return totalChargesMensuelles(charges).plus(provisionsMensuellesLissees(charges));
}
