import type { ChargeRecord } from './types';

/**
 * Compute the next due ISO date (`YYYY-MM-DD`) for a charge, given a
 * reference date (defaults to "today" expressed as YYYY-MM-DD).
 *
 * Algorithm:
 *  1. Iterate over the calendar months starting at `fromYear/fromMonth`,
 *     looking for the next month present in `paymentMonths`.
 *  2. Within that month, the candidate day is `paymentDay` clamped to the
 *     month's actual last day (e.g. paymentDay=31 in February → 28 or 29).
 *  3. If the candidate date is strictly before the reference date, advance
 *     to the next matching month.
 *
 * Returns `null` if the charge is inactive OR if `paymentMonths` is empty.
 *
 * Window: searches up to 24 months ahead. For monthly charges the answer is
 * always within 1 month; for annual it's always within 12; the 24-month
 * cap is purely defensive against ill-formed `paymentMonths` arrays.
 *
 * Pure: no `Date.now()`, no I/O. Pass `fromIso` explicitly.
 */
export function nextDueDateForCharge(charge: ChargeRecord, fromIso: string): string | null {
  if (!charge.isActive) return null;
  if (charge.paymentMonths.length === 0) return null;

  const [refYearStr, refMonthStr, refDayStr] = fromIso.split('-');
  const refYear = Number(refYearStr);
  const refMonth = Number(refMonthStr);
  const refDay = Number(refDayStr);
  if (!Number.isFinite(refYear) || !Number.isFinite(refMonth) || !Number.isFinite(refDay)) {
    return null;
  }

  const monthsSet = new Set(charge.paymentMonths);

  for (let offset = 0; offset < 24; offset += 1) {
    const totalMonth = refMonth - 1 + offset;
    const year = refYear + Math.floor(totalMonth / 12);
    const month = (totalMonth % 12) + 1;
    if (!monthsSet.has(month)) continue;

    const lastDayOfMonth = daysInMonth(year, month);
    const day = Math.min(charge.paymentDay, lastDayOfMonth);

    // If the candidate is in the reference month, ensure it's not in the past.
    if (offset === 0 && day < refDay) continue;

    return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
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
