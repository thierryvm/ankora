import { describe, it, expect, vi, beforeEach } from 'vitest';

import { authenticatedUserResponse, membershipLookupChain } from '../helpers/action-mocks';

const revalidatePathSpy = vi.fn();
const insertSpy = vi.fn(async () => ({ error: null }));
const deleteEqEqSpy = vi.fn(async () => ({ error: null }));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathSpy,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: async () => ({ success: true }),
}));

vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    EXPENSE_CREATED: 'expense.created',
    EXPENSE_DELETED: 'expense.deleted',
  },
  logAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => authenticatedUserResponse() },
    from: (table: string) => {
      if (table === 'workspace_members') return membershipLookupChain();
      if (table === 'expenses') {
        return {
          insert: insertSpy,
          delete: () => ({
            eq: () => ({
              eq: deleteEqEqSpy,
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

beforeEach(() => {
  revalidatePathSpy.mockClear();
  insertSpy.mockClear();
  deleteEqEqSpy.mockClear();
});

describe('expenses Server Actions — revalidatePath uses [locale] dynamic segment', () => {
  it('createExpenseAction revalidates dashboard and expenses list with the [locale] page pattern', async () => {
    const { createExpenseAction } = await import('@/lib/actions/expenses');

    const result = await createExpenseAction({
      label: 'Coffee',
      amount: 3.5,
      occurredOn: '2026-05-03',
      categoryId: null,
      note: null,
      paidFrom: 'vie_courante',
    });

    expect(result.ok).toBe(true);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app', 'page');
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app/expenses', 'page');
  });

  it('deleteExpenseAction revalidates dashboard and expenses list with the [locale] page pattern', async () => {
    const { deleteExpenseAction } = await import('@/lib/actions/expenses');

    const result = await deleteExpenseAction('expense-1');

    expect(result.ok).toBe(true);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app', 'page');
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app/expenses', 'page');
  });

  it('createExpenseAction skips revalidation on Zod validation error', async () => {
    const { createExpenseAction } = await import('@/lib/actions/expenses');

    const result = await createExpenseAction({ label: '', amount: -1 });

    expect(result.ok).toBe(false);
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });
});
