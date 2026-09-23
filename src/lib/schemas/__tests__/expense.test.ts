import { describe, expect, it } from 'vitest';

import { expenseInputSchema, expenseUpdateSchema } from '../expense';

/**
 * F-6 — an expense is never recorded without a category.
 *
 * The sheet used to pre-select the first chip even on a brand-new workspace,
 * where « first » only meant « first in declaration order ». The expense then
 * went in under a category nobody chose. The refusal lives HERE, at the
 * boundary, so that no caller — the sheet, a replayed request, a future form —
 * can write an uncategorised expense by omission.
 */

// RFC 4122 v4 shape: Zod 4 checks the version and variant digits, so an
// arbitrary hex string would be rejected for the wrong reason.
const CATEGORY_ID = '3f6c1a52-8e1b-4c3d-9a7e-2b5d6f8a9c01';

const VALID = {
  label: 'Colruyt',
  amount: 5.05,
  occurredOn: '2026-09-23',
  categoryId: CATEGORY_ID,
  note: null,
};

type Issue = { path: PropertyKey[]; message: string };

function messagesFor(result: { success: boolean; error?: { issues: Issue[] } }) {
  return (result.error?.issues ?? [])
    .filter((issue) => issue.path[0] === 'categoryId')
    .map((issue) => issue.message);
}

describe('expenseInputSchema — the category is required (F-6)', () => {
  it('accepts an expense filed under a category', () => {
    expect(expenseInputSchema.safeParse(VALID).success).toBe(true);
  });

  it('refuses an expense with no categoryId key, saying it is required', () => {
    const withoutCategory = {
      label: VALID.label,
      amount: VALID.amount,
      occurredOn: VALID.occurredOn,
      note: VALID.note,
    };
    const result = expenseInputSchema.safeParse(withoutCategory);
    expect(result.success).toBe(false);
    expect(messagesFor(result)).toEqual(['expense.category.required']);
  });

  it('refuses a null categoryId, saying it is required', () => {
    const result = expenseInputSchema.safeParse({ ...VALID, categoryId: null });
    expect(result.success).toBe(false);
    expect(messagesFor(result)).toEqual(['expense.category.required']);
  });

  it('refuses a categoryId that is not a uuid, saying it is invalid', () => {
    const result = expenseInputSchema.safeParse({ ...VALID, categoryId: 'courses' });
    expect(result.success).toBe(false);
    expect(messagesFor(result)).toEqual(['expense.category.invalid']);
  });
});

describe('expenseUpdateSchema — optional, never null', () => {
  it('accepts an update that does not touch the category', () => {
    // An old expense recorded before F-6 may have no category. Editing its
    // amount must stay possible without forcing a category on it.
    expect(expenseUpdateSchema.safeParse({ amount: 7.05 }).success).toBe(true);
  });

  it('accepts moving an expense to another category', () => {
    expect(expenseUpdateSchema.safeParse({ categoryId: CATEGORY_ID }).success).toBe(true);
  });

  it('refuses to strip the category off an expense', () => {
    const result = expenseUpdateSchema.safeParse({ categoryId: null });
    expect(result.success).toBe(false);
    expect(messagesFor(result)).toEqual(['expense.category.required']);
  });
});
