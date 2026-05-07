import type { ChargeRecord } from '@/lib/domain/charges/types';
import type { ChargePaymentRecord } from './types';

/**
 * Pure query helpers over an in-memory list of payments. The application
 * layer fetches the rows from Supabase and passes them in; the domain
 * layer never touches the DB.
 */

/**
 * Whether a specific charge has a payment row for the given period.
 *
 * Idempotent against duplicate input rows (the DB UNIQUE constraint
 * forbids them, but we don't assume).
 */
export function isChargePaidForMonth(
  chargeId: string,
  payments: readonly ChargePaymentRecord[],
  year: number,
  month: number,
): boolean {
  return payments.some(
    (p) => p.chargeId === chargeId && p.periodYear === year && p.periodMonth === month,
  );
}

/**
 * Subset of charges already paid for the given period.
 *
 * Order-preserving: returns charges in the same order as the input array.
 * Inactive charges are excluded from consideration (matches the cockpit
 * convention — you don't "pay" something that's not active).
 */
export function chargesPaidForMonth(
  charges: readonly ChargeRecord[],
  payments: readonly ChargePaymentRecord[],
  year: number,
  month: number,
): readonly ChargeRecord[] {
  return charges.filter((c) => c.isActive && isChargePaidForMonth(c.id, payments, year, month));
}

/**
 * Subset of active charges that are due in `(year, month)` AND have NOT
 * yet been paid. This is the canonical "À payer ce mois" list.
 *
 * `chargeMatchesMonth` is intentionally not imported here — we re-implement
 * the membership test locally to keep this module self-contained against
 * future refactors of the charges domain.
 */
export function chargesUnpaidForMonth(
  charges: readonly ChargeRecord[],
  payments: readonly ChargePaymentRecord[],
  year: number,
  month: number,
): readonly ChargeRecord[] {
  return charges.filter((c) => {
    if (!c.isActive) return false;
    if (!c.paymentMonths.includes(month)) return false;
    return !isChargePaidForMonth(c.id, payments, year, month);
  });
}
