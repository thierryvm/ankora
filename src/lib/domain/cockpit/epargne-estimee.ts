import Decimal from 'decimal.js';

/**
 * Minimum elapsed days before a projection is shown.
 *
 * Below this, extrapolating a whole month from a couple of days produces
 * noise, not information: a single grocery run on the 2nd would project to
 * fifteen times itself. The UI shows « — » instead, which is honest.
 */
export const JOURS_MIN_PROJECTION = 7;

export type EpargneEstimeeInput = Readonly<{
  /** « Budget du mois » — the domain's `resteDisponible`. */
  budgetDuMois: Decimal;
  /** « Dépensé ce mois » — cf. `depensesDuMois()`. */
  depensesDuMois: Decimal;
  /** Days elapsed in the reference month, including today. 1..31. */
  joursEcoules: number;
  /** Total days in the reference month. 28..31. */
  joursDuMois: number;
}>;

/**
 * Where the month's spending lands if the current pace holds.
 *
 *     depensesDuMois × joursDuMois / joursEcoules
 *
 * Extracted from {@link epargneEstimee}, which was hiding it as a local.
 * `MonthCurve` needs exactly this figure — it is the endpoint of the dashed
 * continuation — and re-deriving it on screen as `budgetDuMois − epargneEstimee`
 * would be a second computation of the same quantity at display time, which
 * `CLAUDE.md` rule 10 forbids and by which two readings of one month begin to
 * drift.
 *
 * Both functions return `null` under the SAME conditions, because one calls the
 * other. A curve that stopped short while the cascade still showed an estimate
 * — or the reverse — would be a contradiction on screen; here it is not
 * representable.
 */
export function depensesProjetees(
  input: Omit<EpargneEstimeeInput, 'budgetDuMois'>,
): Decimal | null {
  const { depensesDuMois, joursEcoules, joursDuMois } = input;

  if (!Number.isFinite(joursEcoules) || joursEcoules < JOURS_MIN_PROJECTION) return null;
  if (!Number.isFinite(joursDuMois) || joursDuMois <= 0) return null;

  return depensesDuMois.times(joursDuMois).dividedBy(joursEcoules);
}

/**
 * « Épargne estimée » — number 4 of the four-figure glossary (ADR-035).
 *
 *     budgetDuMois − (depensesDuMois × joursDuMois / joursEcoules)
 *
 * Projects the current spending pace to the end of the month and reports what
 * would be left. This replaces the former « capacité d'épargne », which was
 * derived from a budget envelope the user had to invent; this one is derived
 * from what the user actually did, so it needs no input at all.
 *
 * Returns `null` when fewer than {@link JOURS_MIN_PROJECTION} days have
 * elapsed — the caller renders « — ». `null` rather than zero, because "no
 * estimate yet" and "an estimate of zero" are different statements about
 * someone's money.
 *
 * The result may be negative: that is a real signal (current pace overspends
 * the month) and is not clamped.
 */
export function epargneEstimee(input: EpargneEstimeeInput): Decimal | null {
  const projetees = depensesProjetees(input);
  if (projetees === null) return null;
  return input.budgetDuMois.minus(projetees);
}
