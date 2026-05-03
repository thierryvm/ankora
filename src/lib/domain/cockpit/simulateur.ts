import Decimal from 'decimal.js';

import { CYCLE_MONTHS, type CockpitCharge } from './types';

export type SimulateurInput = Readonly<{
  charge: CockpitCharge;
  /** Hypothesis for the new amount of the charge (Decimal, not Number). */
  nouveauPrix: Decimal;
}>;

export type SimulateurOutput = Readonly<{
  /** charge.amount - nouveauPrix (positive = saving, negative = extra cost). */
  difference: Decimal;
  /** difference / cycleMonths — what the change is worth on a monthly basis. */
  economieMensuelleLissee: Decimal;
  /** difference × (12 / cycleMonths) — annualised projection. */
  economieAnnuelle: Decimal;
}>;

/**
 * Simulateur d'Action (spec §9). Given a charge and a hypothetical new
 * price, computes the smoothed monthly impact.
 *
 *   difference            = ancien - nouveau
 *   economieMensuelleLissee = difference / cycleMonths
 *   economieAnnuelle      = difference × (12 / cycleMonths)
 *
 * No I/O: the UI is responsible for actually mutating the charge in DB
 * (Server Action `updateCharge`, PR-D8).
 */
export function simulerEconomie(input: SimulateurInput): SimulateurOutput {
  const cycleMonths = CYCLE_MONTHS[input.charge.frequency];
  const difference = input.charge.amount.minus(input.nouveauPrix);
  const economieMensuelleLissee = difference.dividedBy(cycleMonths);
  const economieAnnuelle = difference.times(new Decimal(12).dividedBy(cycleMonths));
  return { difference, economieMensuelleLissee, economieAnnuelle };
}
