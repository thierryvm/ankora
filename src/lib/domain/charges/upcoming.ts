import type { Money } from '@/lib/domain/types';

import { nextDueDateForCharge } from './next-due-date';
import type { ChargeRecord } from './types';

/**
 * Bucket assignment for `getUpcomingCharges()`.
 *
 *  - `overdue`   : `dueDate < today` AND not paid for that period
 *  - `j7`        : due within 7 days (today included → `daysUntilDue ∈ [0, 7]`)
 *  - `j14`       : due within 8..14 days
 *  - `j30`       : due within 15..30 days
 *
 * Buckets are **growing cumulative windows** by design — a single charge
 * falls into exactly one bucket based on its urgency. Charges due more than
 * 30 days out are dropped entirely (out of the cockpit horizon).
 *
 * THI-192 section #5 cockpit v3.
 */
export type UpcomingBucket = 'overdue' | 'j7' | 'j14' | 'j30';

export type UpcomingItem = Readonly<{
  charge: UpcomingChargeInput;
  /** Next due date in ISO `YYYY-MM-DD` (Europe/Brussels). Never null in output. */
  dueDateIso: string;
  /** Negative if overdue (past due), `0..30` otherwise. */
  daysUntilDue: number;
  /** Whether this charge has been paid for the period its due date falls in. */
  isPaid: boolean;
}>;

export type UpcomingByBucket = Readonly<{
  overdue: readonly UpcomingItem[];
  j7: readonly UpcomingItem[];
  j14: readonly UpcomingItem[];
  j30: readonly UpcomingItem[];
}>;

/**
 * Minimal projection of a charge that this helper needs. Wider than
 * `ChargeRecord` would allow callers to pass either the canonical record or
 * a domain-extended legacy `Charge` post-debt-fix; we only depend on the
 * fields that genuinely drive the bucketing.
 */
export type UpcomingChargeInput = Readonly<{
  id: string;
  label: string;
  amount: Money;
  paymentMonths: readonly number[];
  paymentDay: number;
  isActive: boolean;
}>;

/**
 * Payment lookup. Keyed by `${chargeId}-${periodYear}-${periodMonth}` (no
 * zero-padding, matches `paymentKey()` in `domain/cockpit/types`). A truthy
 * value means "paid for that (year, month) cycle".
 *
 * Declared local to this module so callers without access to the cockpit
 * domain (e.g. `app/page.tsx` already using a `PaymentLedger`) can still
 * pass the same Map without coupling.
 */
export type UpcomingPaymentLedger = ReadonlyMap<string, boolean>;

export type GetUpcomingChargesInput = Readonly<{
  charges: readonly UpcomingChargeInput[];
  payments: UpcomingPaymentLedger;
  /** "Today" in ISO `YYYY-MM-DD`, Europe/Brussels (set upstream by the page). */
  todayIso: string;
}>;

const EMPTY_RESULT: UpcomingByBucket = Object.freeze({
  overdue: [],
  j7: [],
  j14: [],
  j30: [],
});

export function getUpcomingCharges(input: GetUpcomingChargesInput): UpcomingByBucket {
  // Build a typed accumulator so we never widen back to `any[]`.
  const buckets = {
    overdue: [] as UpcomingItem[],
    j7: [] as UpcomingItem[],
    j14: [] as UpcomingItem[],
    j30: [] as UpcomingItem[],
  };

  for (const charge of input.charges) {
    if (!charge.isActive) continue;

    const dueDateIso = nextDueDateForCharge(
      // `nextDueDateForCharge` accepts `ChargeRecord`; only `isActive`,
      // `paymentMonths` and `paymentDay` are read. The wider record fields
      // are inert here — casting to the structural minimum keeps the helper
      // callable from places that don't construct a full `ChargeRecord`.
      charge as unknown as ChargeRecord,
      input.todayIso,
    );
    if (dueDateIso === null) continue;

    const daysUntilDue = diffInDays(input.todayIso, dueDateIso);
    if (daysUntilDue > 30) continue;

    const [yearStr, monthStr] = dueDateIso.split('-');
    const dueYear = Number(yearStr);
    const dueMonth = Number(monthStr);
    const isPaid = input.payments.get(paymentKeyFor(charge.id, dueYear, dueMonth)) === true;

    const item: UpcomingItem = { charge, dueDateIso, daysUntilDue, isPaid };

    if (daysUntilDue < 0) {
      // Overdue but already paid → drop. The user has nothing actionable to
      // do; the notification surface already cleared. This mirrors the
      // `genererNotifications()` behaviour for `charge_overdue`.
      if (isPaid) continue;
      buckets.overdue.push(item);
    } else if (daysUntilDue <= 7) {
      buckets.j7.push(item);
    } else if (daysUntilDue <= 14) {
      buckets.j14.push(item);
    } else {
      buckets.j30.push(item);
    }
  }

  // Sort each bucket by ascending urgency (smallest daysUntilDue first).
  // For overdue, that means the deepest delay first (most negative).
  const byUrgency = (a: UpcomingItem, b: UpcomingItem) => a.daysUntilDue - b.daysUntilDue;
  buckets.overdue.sort(byUrgency);
  buckets.j7.sort(byUrgency);
  buckets.j14.sort(byUrgency);
  buckets.j30.sort(byUrgency);

  // If every bucket is empty, return the cached frozen object so callers
  // that compare references can short-circuit ("no upcoming bills").
  if (
    buckets.overdue.length === 0 &&
    buckets.j7.length === 0 &&
    buckets.j14.length === 0 &&
    buckets.j30.length === 0
  ) {
    return EMPTY_RESULT;
  }

  return {
    overdue: buckets.overdue,
    j7: buckets.j7,
    j14: buckets.j14,
    j30: buckets.j30,
  };
}

/**
 * Difference in calendar days between two ISO dates (UTC-anchored). Both
 * arguments are `YYYY-MM-DD` strings. Anchoring on `Date.UTC` eliminates DST
 * drifts within a year.
 */
function diffInDays(fromIso: string, toIso: string): number {
  const from = utcMidnight(fromIso);
  const to = utcMidnight(toIso);
  return Math.round((to - from) / 86_400_000);
}

function utcMidnight(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function paymentKeyFor(chargeId: string, year: number, month: number): string {
  return `${chargeId}-${year}-${month}`;
}
