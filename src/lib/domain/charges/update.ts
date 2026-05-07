import { money } from '@/lib/domain/types';
import type { ChargeRecord, ChargeUpdateInput } from './types';

/**
 * Validation outcome for `validateChargeUpdate()`. Each entry is an i18n
 * error key — the action layer maps it to localized strings.
 */
export type ChargeUpdateValidation = { ok: true } | { ok: false; errors: Record<string, string[]> };

/**
 * Validate a `ChargeUpdateInput` against the same rules enforced by the Zod
 * schema, but in domain terms (Decimal `amount` rather than `number`).
 *
 * The action layer parses the wire payload via Zod first; this function is
 * the second line of defense, used by tests and any non-Zod producer.
 */
export function validateChargeUpdate(updates: ChargeUpdateInput): ChargeUpdateValidation {
  const errors: Record<string, string[]> = {};

  if (updates.label !== undefined) {
    const trimmed = updates.label.trim();
    if (trimmed.length === 0) errors.label = ['charge.label.required'];
    else if (trimmed.length > 120) errors.label = ['charge.label.tooLong'];
  }

  if (updates.amount !== undefined) {
    if (!updates.amount.isFinite()) errors.amount = ['charge.amount.invalid'];
    else if (updates.amount.isNegative()) errors.amount = ['charge.amount.negative'];
    else if (updates.amount.greaterThan(money(1_000_000)))
      errors.amount = ['charge.amount.tooHigh'];
  }

  if (updates.paymentMonths !== undefined) {
    if (updates.paymentMonths.length === 0) errors.paymentMonths = ['charge.paymentMonths.empty'];
    else if (updates.paymentMonths.length > 12)
      errors.paymentMonths = ['charge.paymentMonths.tooMany'];
    else if (updates.paymentMonths.some((m) => !Number.isInteger(m) || m < 1 || m > 12))
      errors.paymentMonths = ['charge.paymentMonths.range'];
  }

  if (updates.paymentDay !== undefined) {
    if (
      !Number.isInteger(updates.paymentDay) ||
      updates.paymentDay < 1 ||
      updates.paymentDay > 31
    ) {
      errors.paymentDay = ['charge.paymentDay.range'];
    }
  }

  if (updates.sortOrder !== undefined) {
    if (!Number.isInteger(updates.sortOrder) || updates.sortOrder < 0) {
      errors.sortOrder = ['charge.sortOrder.invalid'];
    }
  }

  if (updates.notes !== undefined && updates.notes !== null) {
    if (updates.notes.length > 500) errors.notes = ['charge.notes.tooLong'];
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true };
}

/**
 * Pure update of a `ChargeRecord`. Throws if the input is invalid (run
 * `validateChargeUpdate()` first if you need a soft-failure flow).
 *
 * Critical invariants enforced here:
 *  - When `paymentMonths` is provided and non-empty, it is sorted ascending
 *    and de-duplicated. The first month becomes the legacy `dueMonth` so the
 *    snapshot reads stay coherent (per @cowork validation 2026-05-07).
 *  - `notes` is normalized: empty string → null (mirrors DB CHECK constraint).
 *  - `label` is trimmed.
 *
 * Returns a brand-new `ChargeRecord` — never mutates the input.
 */
export function updateCharge(current: ChargeRecord, updates: ChargeUpdateInput): ChargeRecord {
  const validation = validateChargeUpdate(updates);
  if (!validation.ok) {
    throw new Error(`updateCharge: invalid input — ${JSON.stringify(validation.errors)}`);
  }

  const sortedMonths =
    updates.paymentMonths !== undefined
      ? Array.from(new Set(updates.paymentMonths)).sort((a, b) => a - b)
      : current.paymentMonths;

  const nextDueMonth =
    updates.paymentMonths !== undefined && sortedMonths.length > 0
      ? sortedMonths[0]!
      : current.dueMonth;

  const normalizedNotes =
    updates.notes === undefined
      ? current.notes
      : updates.notes === null || updates.notes === ''
        ? null
        : updates.notes;

  return {
    id: current.id,
    workspaceId: current.workspaceId,
    label: updates.label !== undefined ? updates.label.trim() : current.label,
    amount: updates.amount ?? current.amount,
    frequency: updates.frequency ?? current.frequency,
    paymentMonths: sortedMonths,
    paymentDay: updates.paymentDay ?? current.paymentDay,
    dueMonth: nextDueMonth,
    sortOrder: updates.sortOrder ?? current.sortOrder,
    categoryId: updates.categoryId !== undefined ? updates.categoryId : current.categoryId,
    isActive: updates.isActive ?? current.isActive,
    notes: normalizedNotes,
    paidFrom: updates.paidFrom ?? current.paidFrom,
  };
}
