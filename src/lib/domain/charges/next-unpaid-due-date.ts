/**
 * Payment-aware "next unpaid occurrence" for a recurring charge (THI-329).
 *
 * Unlike `nextDueDateForCharge` (which always rolls to the next FUTURE occurrence
 * regardless of payment state), this resolver:
 *   1. **skips occurrences already paid** for their (year, month) period, and
 *   2. **does NOT skip the current-month occurrence when its day has passed** —
 *      it returns it flagged `isOverdue` so the UI can surface a late, unpaid bill
 *      instead of hiding it a year ahead.
 *
 * This reconciles the two complaints:
 *   - "Impôt paid this month still shows June" → June is paid → roll to July.
 *   - "Taxe voiture due June 1, unpaid, shows June 2027" → return June, overdue.
 *
 * **Ledger invariant (plan-reviewer CR-1):** in production the payment ledger is
 * built from `currentMonthPayments` (the current period only), so the skip-paid
 * branch only ever fires on the current-month occurrence — which is correct:
 * a future occurrence cannot already be paid. Widening the ledger to multiple
 * months (a later PR) would make this naturally handle paid future occurrences
 * with no code change.
 *
 * Pure: no `Date.now()`, no I/O. Pass `fromIso` (today, `YYYY-MM-DD`) explicitly.
 * Does NOT touch `nextDueDateForCharge` (kept for its other call-site).
 */

/** Minimal charge shape this resolver needs — structurally a subset of both
 *  `ChargeRecord` and `UpcomingChargeInput` (so callers pass either). `id` is
 *  required to build the ledger key `${id}-${year}-${month}` (cf. `paymentKey`). */
export type PaymentAwareCharge = Readonly<{
  id: string;
  paymentMonths: readonly number[];
  paymentDay: number;
  isActive: boolean;
}>;

export type NextUnpaidDueResult = Readonly<{
  /** Next unpaid occurrence in ISO `YYYY-MM-DD` (Europe/Brussels upstream). */
  dueDateIso: string;
  /** True when that occurrence's date is strictly before `fromIso` (late). */
  isOverdue: boolean;
}>;

/**
 * Ledger key format MUST match `paymentKey()` in `cockpit/types.ts`:
 * `${chargeId}-${year}-${month}` — month is NOT zero-padded.
 */
export function nextUnpaidDueDate(
  charge: PaymentAwareCharge,
  payments: ReadonlyMap<string, boolean>,
  fromIso: string,
): NextUnpaidDueResult | null {
  if (!charge.isActive) return null;
  if (charge.paymentMonths.length === 0) return null;

  const [refYearStr, refMonthStr] = fromIso.split('-');
  const refYear = Number(refYearStr);
  const refMonth = Number(refMonthStr);
  if (!Number.isFinite(refYear) || !Number.isFinite(refMonth)) return null;

  const monthsSet = new Set(charge.paymentMonths);

  // Search the current month and the next 23 — covers every cadence (monthly
  // resolves at offset 0, annual within 12); the 24-cap is defensive against
  // an ill-formed `paymentMonths`.
  for (let offset = 0; offset < 24; offset += 1) {
    const totalMonth = refMonth - 1 + offset;
    const year = refYear + Math.floor(totalMonth / 12);
    const month = (totalMonth % 12) + 1;
    if (!monthsSet.has(month)) continue;
    if (payments.get(`${charge.id}-${year}-${month}`) === true) continue;

    const day = Math.min(charge.paymentDay, daysInMonth(year, month));
    const dueDateIso = `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
    // ISO `YYYY-MM-DD` lexical order === chronological order.
    return { dueDateIso, isOverdue: dueDateIso < fromIso };
  }

  return null;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of (month + 1) === last day of `month` in the JS Date model.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function pad4(n: number): string {
  return n < 1000 ? String(n).padStart(4, '0') : String(n);
}
