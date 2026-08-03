import Decimal from 'decimal.js';

import {
  endOrdinal,
  installmentAmountOf,
  isFinished,
  monthsPerCycle,
  periodOrdinal,
  type Commitment,
} from '../commitments';
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
 */
export function engagementsMensuelsLisses(
  commitments: readonly Commitment[],
  paidKeysByCommitment: ReadonlyMap<string, ReadonlySet<string>>,
  ref: ReferencePeriod,
): Decimal {
  return commitments.reduce((acc, c) => {
    const paidKeys = paidKeysByCommitment.get(c.id) ?? EMPTY;
    if (!engagementPeseSurMois(c, paidKeys, ref)) return acc;
    return acc.plus(new Decimal(installmentAmountOf(c)).dividedBy(monthsPerCycle(c.frequency)));
  }, new Decimal(0));
}
