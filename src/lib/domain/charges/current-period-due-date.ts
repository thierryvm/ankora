/**
 * Resolve a charge's CURRENT-PERIOD due date + status for the charges page.
 *
 * Unlike the dashboard's upcoming-bills resolver (`getUpcomingCharges`, which
 * SKIPS paid occurrences and rolls forward), this resolver ANCHORS to the
 * current period: when the
 * charge is due this month it returns THIS month's occurrence and merely
 * LABELS it (`paid` / `overdue` / `dueThisMonth`) — it never rolls a paid or
 * past current-month bill into the future ("juillet avant juin" fix, THI-329).
 * Only when the current month is NOT a payment month does it return the real
 * next occurrence (`upcoming`).
 *
 * Ledger invariant: `isPaid` is a scalar scoped to `(period.year, period.month)`
 * ONLY — the call-site derives it from the mono-month payment ledger
 * (`currentMonthPayments`). Never pass the paid state of a future occurrence;
 * the `upcoming` branch ignores `isPaid` by construction. This is the deliberate
 * difference from the dashboard's upcoming resolver (which skips paid
 * occurrences): here we anchor + label, there we skip — do not merge them.
 */
export type CurrentPeriodCharge = Readonly<{
  paymentMonths: readonly number[];
  paymentDay: number;
  isActive: boolean;
}>;

export type ChargePeriodStatus = 'paid' | 'overdue' | 'dueThisMonth' | 'upcoming';

export type CurrentPeriodDueResult = Readonly<{
  /** Date to display in ISO `YYYY-MM-DD`: this month when due this month, else the next occurrence. */
  dueDateIso: string;
  status: ChargePeriodStatus;
}>;

export function currentPeriodDueDate(
  charge: CurrentPeriodCharge,
  period: Readonly<{ year: number; month: number }>,
  todayIso: string,
  isPaid: boolean,
): CurrentPeriodDueResult | null {
  if (!charge.isActive) return null;
  if (charge.paymentMonths.length === 0) return null;

  const monthsSet = new Set(charge.paymentMonths);

  for (let offset = 0; offset < 24; offset += 1) {
    const totalMonth = period.month - 1 + offset;
    const year = period.year + Math.floor(totalMonth / 12);
    const month = (totalMonth % 12) + 1;
    if (!monthsSet.has(month)) continue;

    const day = Math.min(charge.paymentDay, daysInMonth(year, month));
    const dueDateIso = `${pad4(year)}-${pad2(month)}-${pad2(day)}`;

    if (offset === 0) {
      // Current month IS a payment month → anchor to it and label.
      // Paid wins over overdue/dueThisMonth (a settled bill is never "late").
      const status: ChargePeriodStatus = isPaid
        ? 'paid'
        : dueDateIso < todayIso
          ? 'overdue'
          : 'dueThisMonth';
      return { dueDateIso, status };
    }

    // Current month is not a payment month → the genuine next occurrence.
    return { dueDateIso, status: 'upcoming' };
  }

  return null;
}

/** Last day of `month` (1-based) in `year`, UTC-anchored (handles leap years). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}
