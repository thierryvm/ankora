import { describe, it, expect, vi, beforeEach } from 'vitest';

const revalidatePathSpy = vi.fn();
const updateEqEqSpy = vi.fn(async () => ({ error: null }));
const updateEqSpy = vi.fn(async () => ({ error: null }));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathSpy,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: async () => ({ success: true }),
}));

vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    ACCOUNT_BALANCE_UPDATED: 'account.balance.updated',
    WORKSPACE_UPDATED: 'workspace.updated',
  },
  logAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-123' } } }) },
    from: (table: string) => {
      if (table === 'workspace_members') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: { workspace_id: 'ws-456', role: 'owner' as const },
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'accounts') {
        return {
          update: () => ({
            eq: () => ({
              eq: updateEqEqSpy,
            }),
          }),
        };
      }
      if (table === 'workspaces') {
        return {
          update: () => ({
            eq: updateEqSpy,
          }),
        };
      }
      return {};
    },
  }),
}));

beforeEach(() => {
  revalidatePathSpy.mockClear();
  updateEqEqSpy.mockClear();
  updateEqSpy.mockClear();
});

describe('accounts Server Actions — revalidatePath uses [locale] dynamic segment', () => {
  it('updateAccountBalanceAction revalidates dashboard and accounts page with the [locale] pattern', async () => {
    const { updateAccountBalanceAction } = await import('@/lib/actions/accounts');

    const result = await updateAccountBalanceAction({ kind: 'principal', balance: 1000 });

    expect(result.ok).toBe(true);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app', 'page');
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app/accounts', 'page');
  });

  it('renameAccountAction revalidates dashboard and accounts page with the [locale] pattern', async () => {
    const { renameAccountAction } = await import('@/lib/actions/accounts');

    const result = await renameAccountAction({ kind: 'epargne', label: 'My savings' });

    expect(result.ok).toBe(true);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app', 'page');
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app/accounts', 'page');
  });

  it('updateMonthlyIncomeAction revalidates dashboard and accounts page with the [locale] pattern', async () => {
    const { updateMonthlyIncomeAction } = await import('@/lib/actions/accounts');

    const result = await updateMonthlyIncomeAction({ monthlyIncome: 2500 });

    expect(result.ok).toBe(true);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app', 'page');
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app/accounts', 'page');
  });

  it('updateVieCouranteTransferAction revalidates dashboard and accounts page with the [locale] pattern', async () => {
    const { updateVieCouranteTransferAction } = await import('@/lib/actions/accounts');

    const result = await updateVieCouranteTransferAction({ amount: 500 });

    expect(result.ok).toBe(true);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app', 'page');
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app/accounts', 'page');
  });

  it('updateAccountBalanceAction skips revalidation on Zod validation error', async () => {
    const { updateAccountBalanceAction } = await import('@/lib/actions/accounts');

    const result = await updateAccountBalanceAction({ kind: 'invalid-kind', balance: 'NaN' });

    expect(result.ok).toBe(false);
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });
});
