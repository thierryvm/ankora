import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Enabling 2FA was permanently impossible for anyone who had ever abandoned an
 * enrolment.
 *
 * The app enrols without a `friendlyName`, so every factor it creates carries
 * the same empty name, and GoTrue refuses an enrolment whose name collides with
 * an existing factor. One abandoned attempt therefore blocked every later one —
 * and the screen listed VERIFIED factors only, so it could neither show nor
 * remove the row doing the blocking. The state was absorbing.
 *
 * These cases pin the cleanup AND its limits: it must never reach a factor that
 * is actually protecting the account.
 */

const { auditSpy, rateLimitSpy, revalidateSpy, listFactorsSpy, unenrollSpy, enrollSpy } =
  vi.hoisted(() => ({
    auditSpy: vi.fn(),
    rateLimitSpy: vi.fn(async () => ({ success: true, limit: 60, remaining: 59 })),
    revalidateSpy: vi.fn(),
    listFactorsSpy: vi.fn(),
    // Typed rather than inferred: inference from the happy path pins `error`
    // to `null`, and the failing-discard case below could then never be
    // written — the guard against replacing one dead end with another would
    // silently drop out of the suite.
    unenrollSpy: vi.fn(async (): Promise<{ error: { code?: string } | null }> => ({ error: null })),
    enrollSpy: vi.fn(
      async (): Promise<{
        data: { id: string; totp: { qr_code: string; secret: string } } | null;
        error: { code?: string } | null;
      }> => ({
        data: { id: 'factor-new', totp: { qr_code: 'data:image/svg+xml,qr', secret: 'SECRET' } },
        error: null,
      }),
    ),
  }));

const ENROLMENT_OK = {
  data: { id: 'factor-new', totp: { qr_code: 'data:image/svg+xml,qr', secret: 'SECRET' } },
  error: null,
};
const CONFLIT = { data: null, error: { code: 'mfa_factor_name_conflict' } };

// `@/lib/log` imports `@/lib/env`, which parses the whole environment at import
// time and throws in the `quality` job (no Supabase, no secrets).
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
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 'a@b.test' } } }),
      mfa: { listFactors: listFactorsSpy, unenroll: unenrollSpy, enroll: enrollSpy },
    },
  }),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Map([['user-agent', 'vitest']]),
}));

vi.mock('@/lib/security/audit-log', () => ({
  AuditEvent: {
    AUTH_MFA_ENABLED: 'auth.mfa_enabled',
    AUTH_MFA_DISABLED: 'auth.mfa_disabled',
    AUTH_MFA_ENROLLMENT_DISCARDED: 'auth.mfa_enrollment_discarded',
  },
  logAuditEvent: auditSpy,
}));

// Without this the action returns `errors.session.rateLimited` before reaching
// the cleanup, and every case below would go green for the wrong reason.
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: rateLimitSpy }));
vi.mock('@/lib/actions/revalidate', () => ({ revalidateAppPath: revalidateSpy }));
vi.mock('@/lib/gdpr/export', () => ({ exportUserData: vi.fn() }));
vi.mock('@/lib/gdpr/deletion', () => ({
  requestDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
}));

type FakeFactor = { id: string; factor_type: string; status: string };

function factorsAre(...all: FakeFactor[]) {
  listFactorsSpy.mockResolvedValue({ data: { all, totp: [], phone: [] }, error: null });
}

const abandonne: FakeFactor = { id: 'factor-stale', factor_type: 'totp', status: 'unverified' };
const actif: FakeFactor = { id: 'factor-live', factor_type: 'totp', status: 'verified' };

describe('enrollMfaAction — abandoned enrolments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitSpy.mockResolvedValue({ success: true, limit: 60, remaining: 59 });
    unenrollSpy.mockResolvedValue({ error: null });
    listFactorsSpy.mockResolvedValue({ data: { all: [], totp: [], phone: [] }, error: null });
    enrollSpy.mockResolvedValue(ENROLMENT_OK);
  });

  /**
   * The happy path must stay non-destructive. The cleanup is REACTIVE: nothing
   * is deleted unless a conflict has proven the deletion necessary. A version
   * that swept on every click would pass every other case in this file, while
   * running a destructive step for the overwhelming majority that never needed
   * it.
   */
  it('deletes nothing when the enrolment simply succeeds', async () => {
    factorsAre(abandonne);
    const { enrollMfaAction } = await import('@/lib/actions/settings');

    const res = await enrollMfaAction();

    expect(res.ok).toBe(true);
    expect(listFactorsSpy).not.toHaveBeenCalled();
    expect(unenrollSpy).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
  });

  /**
   * The regression case, and the ORDER is the whole point: discarding after the
   * retry would leave the conflict intact and the visitor just as stuck, while
   * `toHaveBeenCalled` on both spies would still pass. `invocationCallOrder` is
   * what makes this case able to fail.
   */
  it('discards the abandoned factor and retries, in that order', async () => {
    factorsAre(abandonne);
    enrollSpy.mockResolvedValueOnce(CONFLIT).mockResolvedValueOnce(ENROLMENT_OK);
    const { enrollMfaAction } = await import('@/lib/actions/settings');

    const res = await enrollMfaAction();

    expect(res.ok).toBe(true);
    expect(unenrollSpy).toHaveBeenCalledWith({ factorId: 'factor-stale' });
    expect(enrollSpy).toHaveBeenCalledTimes(2);
    expect(unenrollSpy.mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(
      enrollSpy.mock.invocationCallOrder[1] ?? 0,
    );
  });

  /**
   * The guard that matters most. A cleanup that discarded everything it found
   * would silently disable the 2FA of someone who had actually enabled it —
   * turning a usability bug into a security downgrade.
   */
  it('never touches a verified factor', async () => {
    factorsAre(actif);
    enrollSpy.mockResolvedValue(CONFLIT);
    const { enrollMfaAction } = await import('@/lib/actions/settings');

    const res = await enrollMfaAction();

    expect(unenrollSpy).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
    // Nothing was cleared, so nothing is retried: the blocker is a live factor,
    // and removing it is not this action's call to make.
    expect(enrollSpy).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: false, errorCode: 'errors.auth.mfaEnrollFailed' });
  });

  /** Both at once — the case neither of the two above covers. */
  it('discards only the abandoned one when both exist', async () => {
    factorsAre(actif, abandonne);
    enrollSpy.mockResolvedValueOnce(CONFLIT).mockResolvedValueOnce(ENROLMENT_OK);
    const { enrollMfaAction } = await import('@/lib/actions/settings');

    await enrollMfaAction();

    expect(unenrollSpy).toHaveBeenCalledTimes(1);
    expect(unenrollSpy).toHaveBeenCalledWith({ factorId: 'factor-stale' });
  });

  /**
   * Not narrowed to `totp`, and that is deliberate: GoTrue's name-conflict
   * check walks every factor of the user whatever its type, so a `phone`
   * residue blocks a TOTP enrolment just as well. A well-meant
   * `factor_type === 'totp'` filter would reopen the bug for that case and
   * still pass every other test here.
   */
  it('discards an abandoned factor of another type too', async () => {
    factorsAre({ id: 'factor-phone', factor_type: 'phone', status: 'unverified' });
    enrollSpy.mockResolvedValueOnce(CONFLIT).mockResolvedValueOnce(ENROLMENT_OK);
    const { enrollMfaAction } = await import('@/lib/actions/settings');

    const res = await enrollMfaAction();

    expect(unenrollSpy).toHaveBeenCalledWith({ factorId: 'factor-phone' });
    expect(res.ok).toBe(true);
  });

  /**
   * A cleanup that could not run must not claim it did. Without the audit
   * assertion, this case would stay green while the trail recorded a discard
   * that never happened.
   */
  it('claims nothing when the discard is refused', async () => {
    factorsAre(abandonne);
    enrollSpy.mockResolvedValue(CONFLIT);
    unenrollSpy.mockResolvedValue({ error: { code: 'insufficient_aal' } });
    const { enrollMfaAction } = await import('@/lib/actions/settings');

    const res = await enrollMfaAction();

    expect(auditSpy).not.toHaveBeenCalled();
    expect(enrollSpy).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: false, errorCode: 'errors.auth.mfaEnrollFailed' });
  });

  /**
   * An unreadable list yields an empty list. Without its own branch, a cleanup
   * that never ran would be indistinguishable from one that found nothing to
   * do — the silent-failure family this codebase has been bitten by before.
   */
  it('discards nothing when the factor list cannot be read', async () => {
    listFactorsSpy.mockResolvedValue({ data: null, error: { code: 'unexpected_failure' } });
    enrollSpy.mockResolvedValue(CONFLIT);
    const { enrollMfaAction } = await import('@/lib/actions/settings');

    const res = await enrollMfaAction();

    expect(unenrollSpy).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: false, errorCode: 'errors.auth.mfaEnrollFailed' });
  });

  /**
   * The trail must say what happened and nothing else. `AUTH_MFA_DISABLED`
   * would claim a protection was removed that had never been in place — an
   * unverified factor authenticates nobody.
   */
  it('records the discard under its own event, never as a disablement', async () => {
    factorsAre(abandonne);
    enrollSpy.mockResolvedValueOnce(CONFLIT).mockResolvedValueOnce(ENROLMENT_OK);
    const { enrollMfaAction } = await import('@/lib/actions/settings');

    await enrollMfaAction();

    expect(auditSpy).toHaveBeenCalledTimes(1);
    const [event, , metadata] = auditSpy.mock.calls[0] ?? [];
    expect(event).toBe('auth.mfa_enrollment_discarded');
    expect(metadata).toEqual({ count: 1 });
  });

  /** The rate limit still comes first — enrolling is a mutation. */
  it('does nothing at all when rate limited', async () => {
    factorsAre(abandonne);
    rateLimitSpy.mockResolvedValue({ success: false, limit: 60, remaining: 0 });
    const { enrollMfaAction } = await import('@/lib/actions/settings');

    const res = await enrollMfaAction();

    expect(res).toEqual({ ok: false, errorCode: 'errors.session.rateLimited' });
    expect(listFactorsSpy).not.toHaveBeenCalled();
    expect(unenrollSpy).not.toHaveBeenCalled();
    expect(enrollSpy).not.toHaveBeenCalled();
  });
});

describe('unenrollMfaAction — the trail names what was removed', () => {
  const ID_ACTIF = '11111111-1111-4111-8111-111111111111';
  const ID_ABANDONNE = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
    unenrollSpy.mockResolvedValue({ error: null });
  });

  it('records a real disablement when the factor was protecting the account', async () => {
    factorsAre({ ...actif, id: ID_ACTIF });
    const { unenrollMfaAction } = await import('@/lib/actions/settings');

    const res = await unenrollMfaAction(ID_ACTIF);

    expect(res.ok).toBe(true);
    expect(auditSpy.mock.calls[0]?.[0]).toBe('auth.mfa_disabled');
  });

  /**
   * Reachable only since the screen started handing out the ids of pending
   * enrolments so they can be resumed. Recording one as a disablement would
   * state that a protection was withdrawn that had never been in place.
   */
  it('records a discard when the factor had never been verified', async () => {
    factorsAre({ ...abandonne, id: ID_ABANDONNE });
    const { unenrollMfaAction } = await import('@/lib/actions/settings');

    const res = await unenrollMfaAction(ID_ABANDONNE);

    expect(res.ok).toBe(true);
    expect(auditSpy.mock.calls[0]?.[0]).toBe('auth.mfa_enrollment_discarded');
  });
});
