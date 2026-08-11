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

const { auditSpy, cancelSpy, requestSpy, retrySpy, rateLimitSpy, revalidateSpy } = vi.hoisted(
  () => ({
    auditSpy: vi.fn(),
    cancelSpy: vi.fn(),
    requestSpy: vi.fn(),
    retrySpy: vi.fn(),
    rateLimitSpy: vi.fn(async () => ({ success: true, limit: 60, remaining: 59 })),
    revalidateSpy: vi.fn(),
  }),
);

/** The address the mocked session carries — the destructive-confirmation keyword. */
const EMAIL = 'a@b.test';

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
    GDPR_DELETION_RETRIED: 'gdpr.deletion_retried',
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
  requestDeletion: requestSpy,
  cancelDeletion: cancelSpy,
  retryDeletion: retrySpy,
}));

import {
  cancelAccountDeletionAction,
  requestAccountDeletionAction,
  retryAccountDeletionAction,
} from '../settings';

beforeEach(() => {
  auditSpy.mockClear();
  cancelSpy.mockReset();
  requestSpy.mockReset();
  retrySpy.mockReset();
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

  it('refuses — it does NOT report success — when there was nothing to cancel', async () => {
    cancelSpy.mockResolvedValue({ cancelled: false, reason: 'none' });

    // This used to answer `ok: true`, and that was the defect: the button
    // announced "request cancelled" over a screen still showing the request.
    // Harmless while `none` only meant a stale page — a live trap the day the
    // screen offered the button on a `failed` row, where the old
    // `.eq('status','pending')` filter matched nothing.
    //
    // An issue that moved no row is never a success, whatever the reason. The
    // revalidation still fires so the stale view refreshes.
    await expect(cancelAccountDeletionAction()).resolves.toEqual({
      ok: false,
      errorCode: 'errors.settings.deletionCancelNothing',
    });

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

describe('requestAccountDeletionAction', () => {
  it('CONSUMES the discriminant and refuses on a quarantined request', async () => {
    // The whole point of the discriminated return, and the reason this proof is
    // a Vitest rather than an end-to-end test: the action used to throw the
    // result away. Giving `requestDeletion` a union type would have compiled
    // without a word, and this call would still have answered `ok: true` over a
    // request the queue will never honour — the "it says it worked and nothing
    // happened" defect, moved one function along. An e2e would pass by
    // accident, because the screen redirects either way.
    requestSpy.mockResolvedValue({ kind: 'already_failed' });

    await expect(requestAccountDeletionAction({ confirm: EMAIL })).resolves.toEqual({
      ok: false,
      errorCode: 'errors.settings.deletionAlreadyFailed',
    });

    // And no audit line asserting a request that was not registered.
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('records the request when one was actually scheduled', async () => {
    requestSpy.mockResolvedValue({ kind: 'scheduled', scheduledFor: '2026-08-25T00:00:00.000Z' });

    await expect(requestAccountDeletionAction({ confirm: EMAIL })).resolves.toEqual({ ok: true });

    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0]?.[0]).toBe('gdpr.deletion_requested');
  });
});

describe('retryAccountDeletionAction', () => {
  it('refuses without the typed email address, and never reaches the database', async () => {
    // Relaunching re-arms an irreversible destruction, next to a button whose
    // consequence is the opposite. One click is not enough of a gesture — the
    // same reasoning, and the same schema, as the original request.
    await expect(retryAccountDeletionAction({ confirm: 'not-the-address' })).resolves.toMatchObject(
      { ok: false, errorCode: 'errors.validation.generic' },
    );

    expect(retrySpy).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('writes the audit line — which carries the history the counter reset erases', async () => {
    retrySpy.mockResolvedValue({ retried: true });

    await expect(retryAccountDeletionAction({ confirm: EMAIL })).resolves.toEqual({ ok: true });

    // Non-negotiable rather than decorative: `retryDeletion` just reset
    // `attempts` to 0, so the count of the previous cycle survives in this row
    // and nowhere else. Without it we re-introduce, one level up, the amnesia
    // this whole change fixes.
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0]?.[0]).toBe('gdpr.deletion_retried');

    // No `resource_id`: the metadata allow-list would take it, and it would put
    // the person's UUID back beside a deletion event.
    expect(auditSpy.mock.calls[0]?.[2]).toBeUndefined();
  });

  it('refuses, and stays silent in the audit trail, when no row moved', async () => {
    retrySpy.mockResolvedValue({ retried: false });

    await expect(retryAccountDeletionAction({ confirm: EMAIL })).resolves.toEqual({
      ok: false,
      errorCode: 'errors.settings.deletionRetryNothing',
    });

    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('surfaces a storage failure without writing an audit line', async () => {
    retrySpy.mockRejectedValue(new Error('boom'));

    await expect(retryAccountDeletionAction({ confirm: EMAIL })).resolves.toEqual({
      ok: false,
      errorCode: 'errors.settings.deletionRetryFailed',
    });

    expect(auditSpy).not.toHaveBeenCalled();
  });
});
