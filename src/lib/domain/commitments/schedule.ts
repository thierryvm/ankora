/**
 * Pure schedule + balance math for commitments (épic « Dettes & échéanciers »).
 *
 * A commitment is an engagement with a FINITE number of instalments — a debt
 * with a remaining balance (car loan), an instalment plan that stops (SPF tax
 * arrangement), or a one-off future bill (a single instalment).
 *
 * Everything here is DERIVED from the anchor + cadence + instalment count
 * (ADR-021): the end date, the final instalment's amount, the remaining
 * balance and the progress are never stored, so they can never drift from
 * reality. Zero DB/React dependency.
 *
 * **The anchor is the FIRST instalment** (ADR-021 D3, corrected 2026-08-02).
 * It used to be documented as "the NEXT instalment" while every consumer
 * already treated it as the first — `installmentsPaid` counts ledger ticks
 * from the anchor forward, and the `+` control fills the oldest unpaid
 * SCHEDULED period. The old wording was never implemented; it only survived
 * in a creation form that silently anchored on the month of creation, which
 * is what pushed the SPF plan's end date two months into the future.
 *
 * Money note: amounts are `Decimal` internally, `number` at the API boundary
 * (the RSC boundary cannot carry a Decimal). The previous justification for
 * plain floats — "a fixed count of IDENTICAL instalments" — stopped holding
 * the moment the final instalment became a derived residue: on the real SPF
 * plan, `2407.93 − 10 × 220` evaluates to `207.92999999999984` in float and
 * to `207.93` in Decimal with banker's rounding (`domain/types.ts`).
 */
import { money } from '../types';

export type CommitmentKind = 'debt' | 'installment_plan' | 'one_off';
export type CommitmentFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export type Period = Readonly<{ year: number; month: number }>;

/**
 * A scheduled instalment's calendar date. `day` is `null` when the commitment
 * carries no explicitly chosen payment day (see `hasExplicitPaymentDay`) — the
 * UI then shows month + year only rather than inventing a day.
 */
export type InstallmentDate = Readonly<{ year: number; month: number; day: number | null }>;

export type Commitment = Readonly<{
  id: string;
  kind: CommitmentKind;
  /** Total engaged over the WHOLE plan — every instalment, paid ones included. */
  totalAmount: number;
  /** Amount of ONE regular instalment; null for a one-off (the total is due once). */
  installmentAmount: number | null;
  installmentsTotal: number;
  /** Anchor = the FIRST instalment (ADR-021 D3), not the next unpaid one. */
  startYear: number;
  startMonth: number;
  paymentDay: number;
  frequency: CommitmentFrequency;
  isActive: boolean;
}>;

const MONTHS_BETWEEN: Record<CommitmentFrequency, number> = Object.freeze({
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
});

/** Months between two consecutive instalments of a cadence. */
export const monthsPerCycle = (frequency: CommitmentFrequency): number => MONTHS_BETWEEN[frequency];

/** Stable key for a paid-period set — mirrors the ledger key convention. */
export const periodKey = (year: number, month: number): string => `${year}-${month}`;

/**
 * Calendar month as a comparable ordinal (year·12 + month−1). Exported because
 * the cockpit compares windows without materialising a schedule — one shared
 * definition rather than a private copy per consumer.
 */
export const periodOrdinal = (year: number, month: number): number => year * 12 + (month - 1);

/** Inverse of `periodOrdinal`. */
export const periodFromOrdinal = (ordinal: number): Period => ({
  year: Math.floor(ordinal / 12),
  month: (ordinal % 12) + 1,
});

/** The FIRST instalment's period — the anchor itself. */
export const firstPeriod = (c: Commitment): Period => ({ year: c.startYear, month: c.startMonth });

/**
 * Ordinal of instalment n° `index + 1` (0-based): `first + index · cycle`.
 * Instalment n°1 is the anchor, so the first one carries NO offset — the
 * off-by-one that would push every end date forward by one cycle.
 */
export const installmentOrdinal = (c: Commitment, index: number): number =>
  periodOrdinal(c.startYear, c.startMonth) + index * MONTHS_BETWEEN[c.frequency];

/**
 * Ordinal of the LAST instalment — `first + (total − 1) · cycle`. The single
 * definition of the window's upper bound: the cockpit consumes THIS rather
 * than re-deriving it, so the two can never drift apart.
 */
export const endOrdinal = (c: Commitment): number =>
  installmentOrdinal(c, Math.max(0, c.installmentsTotal - 1));

/** Every scheduled instalment period, in chronological order. */
export function installmentPeriods(c: Commitment): Period[] {
  return Array.from({ length: c.installmentsTotal }, (_, i) =>
    periodFromOrdinal(installmentOrdinal(c, i)),
  );
}

/** Period of the LAST instalment — when the commitment stops weighing on the budget. */
export function endPeriod(c: Commitment): Period {
  return c.installmentsTotal < 1 ? firstPeriod(c) : periodFromOrdinal(endOrdinal(c));
}

/**
 * Whether an instalment falls due in `period` (inactive commitments never are).
 *
 * Direct arithmetic rather than scanning `installmentPeriods()` — this runs
 * per row in the cockpit budget pass, so it must not allocate an array of up
 * to 600 periods on every call (Sourcery #233). Equivalence with the schedule
 * is locked by a property test.
 */
export function isDueInPeriod(c: Commitment, period: Period): boolean {
  if (!c.isActive) return false;
  const step = MONTHS_BETWEEN[c.frequency];
  const offset =
    periodOrdinal(period.year, period.month) - periodOrdinal(c.startYear, c.startMonth);
  if (offset < 0 || offset % step !== 0) return false;
  return offset / step < c.installmentsTotal;
}

// ---------------------------------------------------------------------------
// Calendar dates
// ---------------------------------------------------------------------------

/** Days in a 1-indexed calendar month (leap years included). */
const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Whether the payment day was actually CHOSEN, or is just the column default.
 *
 * `payment_day` is `not null default 1` and the creation form hard-coded it to
 * 1 until 2026-08-02, so every pre-existing row carries a 1 that means "never
 * asked". Rendering it as a real day would show a wrong date to every existing
 * user — worse than showing the month alone. A genuinely-chosen 1st therefore
 * renders as month + year too; that is the deliberate, harmless side of the
 * trade. Distinguishing the two would take a nullable column, i.e. a migration.
 */
export const hasExplicitPaymentDay = (c: Commitment): boolean => c.paymentDay > 1;

/**
 * Calendar date of instalment n° `index + 1` (0-based), clamped to the end of
 * the month: a plan anchored on the 31st falls on 28/29 February, never on
 * 3 March. `day` is null when no payment day was chosen.
 */
export function installmentDate(c: Commitment, index: number): InstallmentDate {
  const { year, month } = periodFromOrdinal(installmentOrdinal(c, index));
  if (!hasExplicitPaymentDay(c)) return { year, month, day: null };
  return { year, month, day: Math.min(c.paymentDay, daysInMonth(year, month)) };
}

/** Calendar date of the FIRST instalment. */
export const firstInstallmentDate = (c: Commitment): InstallmentDate => installmentDate(c, 0);

/** Calendar date of the LAST instalment. */
export const endInstallmentDate = (c: Commitment): InstallmentDate =>
  installmentDate(c, Math.max(0, c.installmentsTotal - 1));

// ---------------------------------------------------------------------------
// Progress & money
// ---------------------------------------------------------------------------

/** The amount of one REGULAR instalment — a one-off owes its whole total at once. */
export function installmentAmountOf(c: Commitment): number {
  return c.installmentAmount ?? c.totalAmount;
}

/**
 * Amount of the FINAL instalment — derived, never stored (ADR-021):
 * `total − (n − 1) × regular`. On the real SPF plan (2 407,93 € = 10 × 220 €
 * + a residue) this is 207,93 €, and the card must not claim otherwise.
 *
 * Clamped to ≥ 0: an over-specified plan (regular instalments summing past the
 * total) yields a 0 final instalment rather than a negative one.
 */
export function lastInstallmentAmount(c: Commitment): number {
  if (c.installmentsTotal <= 1) return installmentAmountOf(c);
  const residue = money(c.totalAmount).minus(
    money(installmentAmountOf(c)).times(c.installmentsTotal - 1),
  );
  return (residue.isNegative() ? money(0) : residue).toDecimalPlaces(2).toNumber();
}

/** Amount of instalment n° `index + 1` (0-based) — only the last one differs. */
export function installmentAmountAt(c: Commitment, index: number): number {
  return index === c.installmentsTotal - 1 ? lastInstallmentAmount(c) : installmentAmountOf(c);
}

/**
 * 0-based index of the instalment whose CYCLE contains `ref` — the companion
 * `installmentAmountAt` needs, so callers stop assuming every instalment is
 * worth the regular one.
 *
 * ## Precondition, and why there is no clamp
 *
 * `ref` is expected inside the plan's window; callers have checked it with
 * `isDueInPeriod` or `engagementPeseSurMois`. Out of it, this returns an
 * out-of-range index, and `installmentAmountAt` then falls into its regular
 * branch (any index ≠ `total − 1` does, negatives included).
 *
 * A clamp to `[0, total − 1]` would look safer and be worse: it would make an
 * out-of-window month report the FINAL instalment's amount, contradicting
 * `installmentAmountAt`, which reports the regular one. Two disagreeing answers
 * to the same out-of-domain question is precisely the drift this pairing
 * exists to remove — and the clamp is unreachable under either guard, so no
 * test could ever exercise it.
 *
 * Takes `Period` rather than the cockpit's `ReferencePeriod`: the two are
 * structurally identical, and `commitments/` must not grow a dependency on
 * `cockpit/` — the arrow between those packages points the other way.
 */
export function installmentIndexAt(c: Commitment, ref: Period): number {
  const delta = periodOrdinal(ref.year, ref.month) - periodOrdinal(c.startYear, c.startMonth);
  return Math.floor(delta / monthsPerCycle(c.frequency));
}

/**
 * Whether the final instalment differs from the regular one — the predicate
 * the UI needs to choose between « 11 échéances de 220 € » (a lie on the SPF
 * plan) and « 10 × 220 € + 207,93 € ».
 */
export function hasIrregularFinalInstallment(c: Commitment): boolean {
  return c.installmentsTotal > 1 && lastInstallmentAmount(c) !== installmentAmountOf(c);
}

/**
 * How many SCHEDULED instalments carry a paid tick. Ledger entries outside the
 * schedule are ignored, so a stray tick can never over-count progress.
 */
export function installmentsPaid(c: Commitment, paidPeriodKeys: ReadonlySet<string>): number {
  return installmentPeriods(c).filter((p) => paidPeriodKeys.has(periodKey(p.year, p.month))).length;
}

/**
 * Period of the instalment that comes NEXT — `first + (paid count) cycles` —
 * or null once every instalment is ticked (settled).
 *
 * Note it advances with the ledger, not with wall-clock time, and not with the
 * oldest HOLE: a plan with a skipped month reports the period one past its
 * tick count. The `+` control deliberately fills the oldest hole instead, so
 * that a forgotten month gets caught up rather than silently abandoned.
 */
export function nextDuePeriod(c: Commitment, paidPeriodKeys: ReadonlySet<string>): Period | null {
  const paid = installmentsPaid(c, paidPeriodKeys);
  if (paid >= c.installmentsTotal) return null;
  return periodFromOrdinal(installmentOrdinal(c, paid));
}

/**
 * Amount still owed. Clamped to [0, totalAmount]: the last instalment absorbs
 * any rounding remainder (3 × 33.33 € on a 100 € plan lands on exactly 0),
 * and a fully-ticked commitment always reads 0 — never a negative balance.
 */
export function remainingBalance(c: Commitment, paidPeriodKeys: ReadonlySet<string>): number {
  const paid = installmentsPaid(c, paidPeriodKeys);
  if (paid >= c.installmentsTotal) return 0;
  const owed = money(c.totalAmount).minus(money(installmentAmountOf(c)).times(paid));
  return (owed.isNegative() ? money(0) : owed).toDecimalPlaces(2).toNumber();
}

/** True once every scheduled instalment has been ticked. */
export function isFinished(c: Commitment, paidPeriodKeys: ReadonlySet<string>): boolean {
  return installmentsPaid(c, paidPeriodKeys) >= c.installmentsTotal;
}
