import Decimal from 'decimal.js';

import {
  endOrdinal,
  installmentAmountAt,
  installmentIndexAt,
  isFinished,
  monthsPerCycle,
  periodOrdinal,
  type Commitment,
} from '../commitments';
import { type NamedCommitment } from '../obligations/types';
import { sommeDesParts, type Poste, type PostePart } from './effort-financier-lisse';
import { type ReferencePeriod } from './types';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Does a finite engagement still weigh on the budget in month `ref`?
 * (ADR-021, rules 1-3.)
 *
 * `installmentsTotal === 1` (⊇ every one-off, by the DB `commitments_one_off_single`
 * check) is excluded: a single payment is a one-time outflow, not a recurring
 * monthly charge — it lives in the « Mes engagements » card, not the reste-à-vivre.
 *
 * The window is compared in ordinal arithmetic rather than by scanning
 * `installmentPeriods()`, so we avoid allocating the schedule array on every
 * row (Sourcery #233). The upper bound is CONSUMED from `endOrdinal()`, not
 * re-derived here: this module used to carry its own copy of
 * `start + (installmentsTotal − 1) · step` with a private `ordinal()` helper,
 * and nothing would have failed if the schedule's definition had changed
 * underneath it. `isFinished` (the one remaining allocation) runs only when
 * the window matches.
 */
export function engagementPeseSurMois(
  c: Commitment,
  paidKeys: ReadonlySet<string>,
  ref: ReferencePeriod,
): boolean {
  if (!c.isActive || c.installmentsTotal === 1) return false;
  const start = periodOrdinal(c.startYear, c.startMonth);
  const cur = periodOrdinal(ref.year, ref.month);
  if (cur < start || cur > endOrdinal(c)) return false;
  return !isFinished(c, paidKeys);
}

/**
 * Smoothed monthly burden of the active finite engagements — mirror (per month)
 * of `provisionsMensuellesLissees`. Each ongoing engagement contributes
 * `installmentAmount / cycleMonths` (a 600 €/quarter plan ⇒ 200 €/month); a
 * single payment / one-off contributes nothing. Fed into `calculerSituationDuMois`
 * so the hero's « Reste disponible » stops ignoring debts (ADR-021).
 *
 * The finite window truncates the last cycle for non-monthly frequencies, so
 * this is NOT euro-conserving over the commitment's life — but the hero shows a
 * single month, and the per-month figure is the honest monthly effort.
 *
 * ## The final instalment is smoothed too — deliberately, with its cost
 *
 * Since 2026-08-05 the LAST instalment contributes its own residue, not the
 * regular amount. On a quarterly plan of 4 × 600 € for a 2 200 € total, the
 * final instalment is 400 €: the month it lands drops from 200 €/month to
 * 133,33 €/month, and the plan's whole-life contribution becomes
 * 9 × 200 + 133,33 = 1 933,33 € against 2 200 € engaged.
 *
 * The alternative — leaving the residue unsmoothed — would contradict the
 * paragraph above, which already accepts non-conservation in exchange for an
 * honest per-month figure. These numbers are written down so the next reader
 * does not "re-correct" it in the other direction. Real data currently holds a
 * single MONTHLY commitment, so this path is unexercised in production.
 */
export function engagementsMensuelsLisses(
  commitments: readonly Commitment[],
  paidKeysByCommitment: ReadonlyMap<string, ReadonlySet<string>>,
  ref: ReferencePeriod,
): Decimal {
  return commitments.reduce((acc, c) => {
    const paidKeys = paidKeysByCommitment.get(c.id) ?? EMPTY;
    if (!engagementPeseSurMois(c, paidKeys, ref)) return acc;
    // `installmentAmountAt` et non `installmentAmountOf` : la DERNIERE
    // echeance est un solde, plus petit que les autres. Sans cela, le mois
    // final soustrait la mensualite pleine et le cockpit se trompe de
    // l'ecart, sans le moindre signal.
    const echeance = installmentAmountAt(c, installmentIndexAt(c, ref));
    return acc.plus(new Decimal(echeance).dividedBy(monthsPerCycle(c.frequency)));
  }, new Decimal(0));
}

/**
 * Le même chiffre, avec ses parts — règle 10 de `CLAUDE.md`.
 *
 * La signature à trois arguments n'est pas une commodité : c'est la condition
 * pour que la somme des parts égale le total. Une variante qui ne recevrait que
 * la liste sommerait les engagements terminés, inactifs et les paiements
 * uniques, et rendrait un total SUPÉRIEUR à `engagementsMensuelsLisses` — le
 * filtre `engagementPeseSurMois` a besoin des échéances payées et du mois de
 * référence, pas seulement des engagements.
 *
 * `origine` explique la division quand la cadence n'est pas mensuelle : un plan
 * à 600 € par trimestre pèse 200 € par mois, et l'interface doit pouvoir le dire.
 * `null` pour une mensualité, qui ne subit aucune division.
 */
export function engagementsDuMois(
  commitments: readonly NamedCommitment[],
  paidKeysByCommitment: ReadonlyMap<string, ReadonlySet<string>>,
  ref: ReferencePeriod,
): Poste {
  const parts: PostePart[] = [];
  for (const c of commitments) {
    const paidKeys = paidKeysByCommitment.get(c.id) ?? EMPTY;
    if (!engagementPeseSurMois(c, paidKeys, ref)) continue;
    const cycleMois = monthsPerCycle(c.frequency);
    const echeance = new Decimal(installmentAmountAt(c, installmentIndexAt(c, ref)));
    parts.push({
      id: c.id,
      libelle: c.label,
      montantMensuel: echeance.dividedBy(cycleMois),
      origine: cycleMois === 1 ? null : { montantFacture: echeance, cycleMois },
    });
  }
  // `sommeDesParts` du module voisin, et non un `reduce` local : la sommation
  // d'un `Poste` vit à un seul endroit, sinon les trois producteurs peuvent
  // diverger sur l'ordre des opérations `Decimal`.
  return { total: sommeDesParts(parts), parts };
}
