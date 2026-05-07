import { money, type Money } from '@/lib/domain/types';
import type { ChargeRecord } from '@/lib/domain/charges/types';
import type { ChargePaymentRecord } from './types';

/**
 * Build a `ChargePaymentRecord` ready to insert (id stub, server-set on
 * persistence). Pure — no I/O, no Date.now().
 *
 * Inputs:
 *   - charge      : the charge being marked paid (provides workspaceId, default amount)
 *   - year, month : the period
 *   - paidAtIso   : timestamp of the toggle (caller decides; usually `new Date().toISOString()` at the action layer)
 *   - createdBy   : the auth user UUID
 *   - overrides   : optional override of `paidAmount` and/or `note`
 *
 * Throws when:
 *   - month is out of range (1..12)
 *   - year is out of range (2000..2100)
 *   - the charge is inactive (you can't "pay" an inactive charge)
 *   - paidAmount is negative or non-finite
 *
 * Idempotence is enforced at the DB layer via UNIQUE
 * (charge_id, period_year, period_month) — the application layer should
 * detect the conflict and treat it as "already paid".
 */
export function markChargePaid(input: {
  charge: ChargeRecord;
  year: number;
  month: number;
  paidAtIso: string;
  createdBy: string;
  overrides?: { paidAmount?: Money; note?: string | null };
}): Omit<ChargePaymentRecord, 'id' | 'createdAt'> {
  const { charge, year, month, paidAtIso, createdBy, overrides } = input;

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`markChargePaid: month must be 1..12, got ${month}`);
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new RangeError(`markChargePaid: year must be 2000..2100, got ${year}`);
  }
  if (!charge.isActive) {
    throw new Error(`markChargePaid: charge ${charge.id} is inactive`);
  }

  const amount = overrides?.paidAmount ?? charge.amount;
  if (!amount.isFinite()) {
    throw new RangeError(`markChargePaid: paidAmount must be finite, got ${amount.toString()}`);
  }
  if (amount.isNegative()) {
    throw new RangeError(`markChargePaid: paidAmount must be ≥ 0, got ${amount.toString()}`);
  }

  const note = overrides?.note ?? null;

  return {
    chargeId: charge.id,
    workspaceId: charge.workspaceId,
    periodYear: year,
    periodMonth: month,
    paidAt: paidAtIso,
    paidAmount: money(amount),
    bucketId: null,
    note,
    createdBy,
  };
}
