import { money } from '@/lib/domain/types';
import type { ExpenseRecord, ExpenseUpdateInput } from './types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ExpenseUpdateValidation =
  | { ok: true }
  | { ok: false; errors: Record<string, string[]> };

/**
 * Validate an `ExpenseUpdateInput` mirroring `expenseUpdateSchema` (Zod) but
 * in domain terms. Used by `updateExpense()` and by tests / non-Zod
 * producers.
 *
 * Notable rule: `occurredOn` is parsed as a calendar date in UTC and
 * compared against `today` (computed from `todayIso` arg). We do NOT allow
 * future dates — Ankora is a journaling cockpit, not a forecasting tool.
 */
export function validateExpenseUpdate(
  updates: ExpenseUpdateInput,
  todayIso: string,
): ExpenseUpdateValidation {
  const errors: Record<string, string[]> = {};

  if (updates.label !== undefined) {
    const trimmed = updates.label.trim();
    if (trimmed.length === 0) errors.label = ['expense.label.required'];
    else if (trimmed.length > 120) errors.label = ['expense.label.tooLong'];
  }

  if (updates.amount !== undefined) {
    if (!updates.amount.isFinite()) errors.amount = ['expense.amount.invalid'];
    else if (updates.amount.isNegative()) errors.amount = ['expense.amount.negative'];
    else if (updates.amount.greaterThan(money(1_000_000)))
      errors.amount = ['expense.amount.tooHigh'];
  }

  if (updates.occurredOn !== undefined) {
    if (!ISO_DATE_RE.test(updates.occurredOn)) {
      errors.occurredOn = ['expense.date.format'];
    } else if (updates.occurredOn > todayIso) {
      errors.occurredOn = ['expense.date.future'];
    } else if (!isCalendarValid(updates.occurredOn)) {
      // Catch e.g. "2026-02-30" which matches the regex but is not a real day.
      errors.occurredOn = ['expense.date.format'];
    }
  }

  if (updates.note !== undefined && updates.note !== null) {
    if (updates.note.length > 500) errors.note = ['expense.note.tooLong'];
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true };
}

/**
 * Pure update of an `ExpenseRecord`. Throws on invalid input.
 * Returns a brand-new record — never mutates the input.
 */
export function updateExpense(
  current: ExpenseRecord,
  updates: ExpenseUpdateInput,
  todayIso: string,
): ExpenseRecord {
  const validation = validateExpenseUpdate(updates, todayIso);
  if (!validation.ok) {
    throw new Error(`updateExpense: invalid input — ${JSON.stringify(validation.errors)}`);
  }

  const normalizedNote =
    updates.note === undefined
      ? current.note
      : updates.note === null || updates.note === ''
        ? null
        : updates.note;

  return {
    id: current.id,
    workspaceId: current.workspaceId,
    label: updates.label !== undefined ? updates.label.trim() : current.label,
    amount: updates.amount ?? current.amount,
    occurredOn: updates.occurredOn ?? current.occurredOn,
    categoryId: updates.categoryId !== undefined ? updates.categoryId : current.categoryId,
    note: normalizedNote,
    paidFrom: updates.paidFrom ?? current.paidFrom,
  };
}

function isCalendarValid(iso: string): boolean {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  // Build a UTC date and check round-trip — catches Feb 30, Apr 31, etc.
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
