import type { ReferencePeriod } from '@/lib/domain/cockpit/types';
import type { MonthObligation } from './types';

/** Days in a calendar month — `day 0` of the next month is the last of this one. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * ISO due date of an occurrence in `ref`. A payment day of 31 in a 30-day month
 * lands on the 30th rather than rolling into the next month — the bill is due
 * in ITS month, and rolling it forward is how « juillet avant juin » was born.
 */
export function dueDateIso(paymentDay: number, ref: ReferencePeriod): string {
  const day = Math.min(Math.max(paymentDay, 1), daysInMonth(ref.year, ref.month));
  return `${ref.year}-${String(ref.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Occurrences whose due date has already passed (today included).
 *
 * The comparison is a plain ISO string comparison, which is a correct date
 * ordering for `YYYY-MM-DD` and needs no timezone arithmetic — `todayIso` is
 * the caller's Europe/Brussels wall clock, resolved server-side and never
 * trusted from a client.
 *
 * A month entirely in the past yields every occurrence, which is the intent:
 * @thierry catching up on June in July should be one gesture, not fourteen.
 */
export function echeancesPassees(
  obligations: readonly MonthObligation[],
  ref: ReferencePeriod,
  todayIso: string,
): readonly MonthObligation[] {
  return obligations.filter((o) => dueDateIso(o.paymentDay, ref) <= todayIso);
}

/**
 * What one press of « marquer les échéances passées comme payées » should do.
 *
 * ONE gesture, and the SAME gesture undoes it: when every past occurrence is
 * already ticked, the press unticks exactly those. No confirmation dialog —
 * a dialog on a reversible action buys nothing and costs a tap every month.
 *
 * `'rien'` when the month has no past occurrence at all: the button has nothing
 * to act on and the UI hides it rather than offering a no-op.
 */
export type GesteGroupe = 'pointer' | 'depointer' | 'rien';

export function gesteGroupePour(passees: readonly MonthObligation[]): GesteGroupe {
  if (passees.length === 0) return 'rien';
  return passees.every((o) => o.isPaid) ? 'depointer' : 'pointer';
}

/**
 * The occurrences one press actually writes to. Ticking touches only what is
 * unticked (already-paid rows are left alone, so the gesture is idempotent);
 * unticking touches all of them, since that branch only fires when all are
 * ticked.
 */
export function ciblesDuGesteGroupe(
  passees: readonly MonthObligation[],
): readonly MonthObligation[] {
  return gesteGroupePour(passees) === 'pointer' ? passees.filter((o) => !o.isPaid) : passees;
}
