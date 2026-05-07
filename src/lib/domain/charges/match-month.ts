import type { ChargeRecord } from './types';

/**
 * Whether a charge falls due in a given (year, month) — used by the
 * "Mes charges" sub-section grouping (per account, per month) and by
 * the "À payer en {mois}" cockpit list.
 *
 * Inactive charges always return `false`.
 *
 * Pure: just a membership test on `paymentMonths`. Year is currently
 * unused but accepted in the signature so future per-year deactivation
 * (e.g. one-shot bills) can be added without breaking callers.
 */
export function chargeMatchesMonth(charge: ChargeRecord, _year: number, month: number): boolean {
  if (!charge.isActive) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  return charge.paymentMonths.includes(month);
}
