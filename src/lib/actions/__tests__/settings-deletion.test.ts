import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `cancelAccountDeletionAction` used to emit `GDPR_DELETION_CANCELLED`
 * unconditionally, because `cancelDeletion` returned `void`: a filter matching
 * zero rows was indistinguishable from a real cancellation. The audit trail
 * therefore asserted something that had not happened — the same class of
 * inexact statement (art. 12(1)) as the countdown nothing was executing.
 *
 * Inert while the queue was inert. Once a run can own a request, "cancelled"
 * told to someone whose erasure is already under way is a false statement about
 * an irreversible act.
 */

const { auditSpy, cancelSpy, rateLimitSpy, revalidateSpy } = vi.hoisted(() => ({
  auditSpy: vi.fn(),
  cancelSpy: vi.fn(),
  rateLimitSpy: vi.fn(async () => ({ success: true, limit: 60, remaining: 59 })),
  revalidateSpy: vi.fn(),
}));

// `@/lib/log` imports `@/lib/env`, which parses the whole environment at import
// time and throws in the `quality` job (no Supabase, no secrets — ci.yml:14-35).
vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    INTERNAL_SECRET: 'a'.repeat(32),
  },
  clientEnv: {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'a@b.test' } } }) },
  }),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Map([['user-agent', 'vitest']]),
}));

vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    GDPR_DELETION_REQUESTED: 'gdpr.deletion_requested',
    GDPR_DELETION_CANCELLED: 'gdpr.deletion_cancelled',
    GDPR_EXPORT_REQUESTED: 'gdpr.export_requested',
    AUTH_MFA_ENABLED: 'auth.mfa_enabled',
    AUTH_MFA_DISABLED: 'auth.mfa_disabled',
  },
  logAuditEvent: auditSpy,
}));

vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: rateLimitSpy }));
vi.mock('@/lib/actions/revalidate', () => ({ revalidateAppPath: revalidateSpy }));
vi.mock('@/lib/gdpr/export', () => ({ exportUserData: vi.fn() }));
vi.mock('@/lib/gdpr/deletion', () => ({
  requestDeletion: vi.fn(),
  cancelDeletion: cancelSpy,
}));

import { cancelAccountDeletionAction } from '../settings';

beforeEach(() => {
  auditSpy.mockClear();
  cancelSpy.mockReset();
  revalidateSpy.mockClear();
});

describe('cancelAccountDeletionAction', () => {
  it('records the audit line when a request was actually cancelled', async () => {
    cancelSpy.mockResolvedValue({ cancelled: true });

    await expect(cancelAccountDeletionAction()).resolves.toEqual({ ok: true });

    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0]?.[0]).toBe('gdpr.deletion_cancelled');
  });

  it('refuses, and stays silent in the audit trail, once a run owns the request', async () => {
    cancelSpy.mockResolvedValue({ cancelled: false, reason: 'in_progress' });

    await expect(cancelAccountDeletionAction()).resolves.toEqual({
      ok: false,
      errorCode: 'errors.settings.deletionCancelTooLate',
    });

    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('stays silent in the audit trail when there was nothing to cancel', async () => {
    cancelSpy.mockResolvedValue({ cancelled: false, reason: 'none' });

    // Not an error: the page simply held a stale view, and the revalidation
    // below sends it back to settings.
    await expect(cancelAccountDeletionAction()).resolves.toEqual({ ok: true });

    expect(auditSpy).not.toHaveBeenCalled();
    expect(revalidateSpy).toHaveBeenCalled();
  });

  it('surfaces a storage failure without writing an audit line', async () => {
    cancelSpy.mockRejectedValue(new Error('boom'));

    await expect(cancelAccountDeletionAction()).resolves.toEqual({
      ok: false,
      errorCode: 'errors.settings.deletionCancelFailed',
    });

    expect(auditSpy).not.toHaveBeenCalled();
  });
});
