import Decimal from 'decimal.js';

import { installmentAmountOf, isFinished, type Commitment } from '../commitments';
import { CYCLE_MONTHS, type ReferencePeriod } from './types';

/** Calendar month as a comparable ordinal (year*12 + month−1). */
const ordinal = (year: number, month: number): number => year * 12 + (month - 1);
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
 * `installmentPeriods()`: the last instalment's ordinal is provably
 * `start + (installmentsTotal − 1) · step` (same derivation as `isDueInPeriod`),
 * so we avoid allocating the schedule array on every row (Sourcery #233).
 * `isFinished` (the one remaining allocation) runs only when the window matches.
 */
export function engagementPeseSurMois(
  c: Commitment,
  paidKeys: ReadonlySet<string>,
  ref: ReferencePeriod,
): boolean {
  if (!c.isActive || c.installmentsTotal === 1) return false;
  const step = CYCLE_MONTHS[c.frequency];
  const start = ordinal(c.startYear, c.startMonth);
  const end = start + (c.installmentsTotal - 1) * step;
  const cur = ordinal(ref.year, ref.month);
  if (cur < start || cur > end) return false;
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
    return acc.plus(new Decimal(installmentAmountOf(c)).dividedBy(CYCLE_MONTHS[c.frequency]));
  }, new Decimal(0));
}
