import Decimal from 'decimal.js';

/**
 * The month's rhythm: how much of the month budget a steady pace would have
 * spent by a given day — the dotted line of the « Rythme du mois » card — and
 * the gap between what was really spent and that line.
 *
 * Written ONCE here and read by every display of the card: the fold's key,
 * the header, each day slice and both drawers (`g-jour`, `g-rythme`). A
 * second formula in a component would drift from this one at exactly the
 * point where the reader compares two figures.
 *
 * Mockup source: `rythmeAuG` (budget × day ÷ days of the month, rounded to the
 * cent) and `pileG` (under 0.50 € either way, « pile sur le rythme »).
 *
 * Pure: `decimal.js` only.
 */

/**
 * The rhythm on `jour` (0 to `joursDuMois`), rounded to the cent. `null` when
 * there is nothing to pace against — a budget that is not positive — or when
 * the day does not belong to the month.
 */
export function rythmeAuJour(budget: Decimal, jour: number, joursDuMois: number): Decimal | null {
  if (!budget.gt(0)) return null;
  if (!Number.isInteger(joursDuMois) || joursDuMois <= 0) return null;
  if (!Number.isInteger(jour) || jour < 0 || jour > joursDuMois) return null;
  return budget.times(jour).dividedBy(joursDuMois).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Spent minus rhythm: negative under the rhythm (a margin), positive over it. */
export function ecartAuRythme(depenseCumule: Decimal, rythme: Decimal): Decimal {
  return depenseCumule.minus(rythme);
}

/**
 * The gap the card ANNOUNCES (H3, tour 65 bis): the month's whole recorded
 * spending against the rhythm of `jour`. It reads the same spending as « Il te
 * reste » (`depensesDuMois`, a post-dated line included) and, given the same
 * budget (`resteDisponible`), it can never call a margin what « Il te reste »
 * calls an overspend: `ilTeReste < 0` means spending above the budget, hence
 * above any rhythm. The day curve still places each line on its own date.
 */
export function ecartDuMois(
  input: Readonly<{ budget: Decimal; depensesDuMois: Decimal; jour: number; joursDuMois: number }>,
): Decimal | null {
  const rythme = rythmeAuJour(input.budget, input.jour, input.joursDuMois);
  return rythme ? ecartAuRythme(input.depensesDuMois, rythme) : null;
}

export type SensDeLEcart = 'pile' | 'marge' | 'dessus';

/** The gap in words: « pile » when it rounds to 0 € either way (under 0.50 €). */
export function sensDeLEcart(ecart: Decimal): SensDeLEcart {
  if (ecart.abs().lt(0.5)) return 'pile';
  return ecart.lt(0) ? 'marge' : 'dessus';
}
