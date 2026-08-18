import Decimal from 'decimal.js';

import { provisionsMensuellesLissees } from './effort-financier-lisse';
import { genererPrevisions } from './previsions';
import { periodicCharges, type CockpitCharge, type ReferencePeriod } from './types';

export type MoisDuFonds = Readonly<{
  year: number;
  /** 1..12 */
  month: number;
  /** Cash leaving the fund this month — the periodic bills that actually drop. */
  sortie: Decimal;
  /** Monthly smoothed contribution flowing into the fund. Constant by design. */
  lisse: Decimal;
  /** `lisse − sortie`. Positive: the month feeds the fund. Negative: it draws. */
  ecart: Decimal;
  /** Fund balance AFTER this month's movements. Negative = the fund broke. */
  solde: Decimal;
}>;

export type ProjectionFondsInput = Readonly<{
  charges: readonly CockpitCharge[];
  /** Balance of the provisions account today. */
  soldeInitial: Decimal;
  ref: ReferencePeriod;
  /** Months to project. 12 by the mobile design; exposed for testing. */
  horizonMonths?: number;
}>;

const DEFAULT_HORIZON = 12;

/**
 * Does the provision fund hold until the next big bill?
 *
 * ## The three lines that were missing
 *
 * `genererPrevisions()` already produces the per-month outflow — implemented,
 * tested, and until now with **zero production call-site**. What it never had
 * is the accumulator:
 *
 * ```
 * solde = solde + lissé − sortie
 * ```
 *
 * iterated over the horizon. That single line is the difference between « ta
 * jauge est à 100 % aujourd'hui » and « en mars ton fonds passe sous zéro » —
 * the only question the smoothing actually raises. This function is that
 * accumulator, and it is what finally gives `genererPrevisions` a caller.
 *
 * ## Why only the periodic charges
 *
 * The fund exists to absorb the bills that do NOT fall every month. Monthly
 * charges are paid from income as they arrive and never transit through the
 * provisions account; including them would model a fund that is drained by rent
 * it never held. So the projection runs over `periodicCharges` on both sides —
 * the outflow AND the contribution (`provisionsMensuellesLissees`, which is
 * already periodic-only).
 *
 * ## What is deliberately not modelled
 *
 * The contribution is constant across the horizon: it is what the user's
 * current charge list implies each month, not a plan that adapts. A bill added
 * next March changes the figure for every month at once, which is honest — the
 * projection describes today's obligations projected forward, and says nothing
 * about obligations that do not exist yet.
 */
export function projeterFondsProvision(input: ProjectionFondsInput): readonly MoisDuFonds[] {
  const horizon = input.horizonMonths ?? DEFAULT_HORIZON;
  const periodiques = periodicCharges(input.charges);
  const lisse = provisionsMensuellesLissees(input.charges);

  // `revenus: 0` — this projection is about the fund, not the household budget,
  // so `margePrevue` (income − charges) is not read. `totalCharges` is.
  const sorties = genererPrevisions({
    charges: periodiques,
    ref: input.ref,
    revenus: new Decimal(0),
    horizonMonths: horizon,
  });

  let solde = input.soldeInitial;
  return sorties.map((m) => {
    const ecart = lisse.minus(m.totalCharges);
    solde = solde.plus(ecart);
    return { year: m.year, month: m.month, sortie: m.totalCharges, lisse, ecart, solde };
  });
}

/**
 * First month whose balance goes negative, or `null` when the fund holds across
 * the whole horizon. This is the sentence the screen leads with; the 12 rows
 * are the proof behind it.
 */
export function premierMoisEnDeficit(projection: readonly MoisDuFonds[]): MoisDuFonds | null {
  return projection.find((m) => m.solde.lt(0)) ?? null;
}
