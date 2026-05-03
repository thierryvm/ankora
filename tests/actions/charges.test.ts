import { describe, it, expect, vi, beforeEach } from 'vitest';

const revalidatePathSpy = vi.fn();
const insertSpy = vi.fn(async () => ({ error: null }));
const updateEqEqSpy = vi.fn(async () => ({ error: null }));
const deleteEqEqSpy = vi.fn(async () => ({ error: null }));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathSpy,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: async () => ({ success: true }),
}));

vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    CHARGE_CREATED: 'charge.created',
    CHARGE_UPDATED: 'charge.updated',
    CHARGE_DELETED: 'charge.deleted',
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
      if (table === 'charges') {
        return {
          insert: insertSpy,
          update: () => ({
            eq: () => ({
              eq: updateEqEqSpy,
            }),
          }),
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
  updateEqEqSpy.mockClear();
  deleteEqEqSpy.mockClear();
});

describe('charges Server Actions — revalidatePath uses [locale] dynamic segment', () => {
  it('createChargeAction revalidates dashboard and charges list with the [locale] page pattern', async () => {
    const { createChargeAction } = await import('@/lib/actions/charges');

    const result = await createChargeAction({
      label: 'Netflix',
      amount: 12.99,
      frequency: 'monthly',
      dueMonth: 1,
      categoryId: null,
      isActive: true,
      notes: null,
    });

    expect(result.ok).toBe(true);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app', 'page');
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app/charges', 'page');
  });

  it('updateChargeAction revalidates dashboard and charges list with the [locale] page pattern', async () => {
    const { updateChargeAction } = await import('@/lib/actions/charges');

    const result = await updateChargeAction('charge-1', { label: 'Spotify' });

    expect(result.ok).toBe(true);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app', 'page');
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app/charges', 'page');
  });

  it('deleteChargeAction revalidates dashboard and charges list with the [locale] page pattern', async () => {
    const { deleteChargeAction } = await import('@/lib/actions/charges');

    const result = await deleteChargeAction('charge-1');

    expect(result.ok).toBe(true);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app', 'page');
    expect(revalidatePathSpy).toHaveBeenCalledWith('/[locale]/app/charges', 'page');
  });

  it('createChargeAction skips revalidation on Zod validation error', async () => {
    const { createChargeAction } = await import('@/lib/actions/charges');

    const result = await createChargeAction({ label: '', amount: -1 });

    expect(result.ok).toBe(false);
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });
});
