/**
 * The day a bill was paid — the calendar day the bank debited it.
 *
 * A bill ticked on the 28th but debited on the 9th must count on the 9th: a
 * statement read on the 28th already contains it. Dating the payment at the
 * tick would count it a second time after that statement.
 *
 * Pure calendar arithmetic on zone-less `YYYY-MM-DD` days, through `Date.UTC`
 * only — never a local midnight.
 */

const DAY_MS = 86_400_000;

/** How far a payment may sit outside its period, on either side. */
export const PAYMENT_DAY_SLACK_DAYS = 31;

function isoOf(stamp: number): string {
  return new Date(stamp).toISOString().slice(0, 10);
}

/** `true` for a real calendar day written `YYYY-MM-DD` (no 30 February). */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const stamp = Date.UTC(y, m - 1, d);
  return Number.isFinite(stamp) && isoOf(stamp) === value;
}

/**
 * The days a payment for (`year`, `month`) may be dated on: from 31 days
 * before the first day of the month to 31 days after its last day. A bill
 * paid early or late still belongs to its period; a day further away is a
 * typo, and it would move money across a statement it has nothing to do with.
 */
export function paymentDayWindow(year: number, month: number): { min: string; max: string } {
  const first = Date.UTC(year, month - 1, 1);
  const last = Date.UTC(year, month, 0);
  return {
    min: isoOf(first - PAYMENT_DAY_SLACK_DAYS * DAY_MS),
    max: isoOf(last + PAYMENT_DAY_SLACK_DAYS * DAY_MS),
  };
}

/**
 * The day the form proposes: the due date of the period, or today when the
 * due date is still ahead (or unknown) — a paid day is never in the future.
 */
export function defaultPaymentDay(dueIso: string | null, todayIso: string): string {
  if (dueIso === null || dueIso > todayIso) return todayIso;
  return dueIso;
}

/**
 * The instant stored for a paid day: noon UTC. Brussels is UTC+1 or UTC+2, so
 * noon UTC is the same calendar day there in winter and in summer — the day
 * every reader of `paid_at` projects back onto.
 */
export function paidAtForDay(dayIso: string): string {
  return `${dayIso}T12:00:00.000Z`;
}
