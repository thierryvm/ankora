import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `setLocaleAction` is the Server Action invoked by `LocaleSwitcher`.
 *
 * Contract:
 *   1. Parse + validate input against the `LOCALES` Zod enum.
 *   2. Write the `NEXT_LOCALE` cookie with the documented attributes
 *      (1-year maxAge, sameSite=lax, secure in prod, path=/).
 *   3. Persist the choice on `users.locale` when a user is authenticated
 *      (fallback persistence for cross-device cookie loss).
 *   4. Invalidate the RSC cache layout-wide via
 *      `revalidatePath('/', 'layout')` so any previously prefetched
 *      `<Link>` entries refetch fresh with the new locale on the next
 *      client navigation. Architectural corollary of the
 *      `router.refresh()` removal in PR-BETA-2 (see THI-266) — the
 *      root cause of TICKET 7 reproducing on iPhone Safari for
 *      anonymous users on the PR #181 preview (see THI-276).
 */

const {
  revalidatePathMock,
  cookieSetMock,
  cookiesMock,
  supabaseGetUserMock,
  supabaseFromMock,
  supabaseUpdateMock,
  supabaseEqMock,
  createClientMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  cookieSetMock: vi.fn(),
  cookiesMock: vi.fn(),
  supabaseGetUserMock: vi.fn(),
  supabaseFromMock: vi.fn(),
  supabaseUpdateMock: vi.fn(),
  supabaseEqMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

import { setLocaleAction } from '@/lib/actions/locale';

beforeEach(() => {
  revalidatePathMock.mockClear();
  cookieSetMock.mockClear();
  cookiesMock.mockReset();
  supabaseGetUserMock.mockReset();
  supabaseFromMock.mockReset();
  supabaseUpdateMock.mockReset();
  supabaseEqMock.mockReset();
  createClientMock.mockReset();

  // Default wiring — rebuilt per test so `mockReset` doesn't strand the
  // chain. Tests that need a custom user identity override `supabaseGetUserMock`.
  cookiesMock.mockResolvedValue({ set: cookieSetMock });
  supabaseEqMock.mockResolvedValue({ data: null, error: null });
  supabaseUpdateMock.mockReturnValue({ eq: supabaseEqMock });
  supabaseFromMock.mockReturnValue({ update: supabaseUpdateMock });
  createClientMock.mockResolvedValue({
    auth: { getUser: supabaseGetUserMock },
    from: supabaseFromMock,
  });
  // Default to anonymous; auth-specific suites override.
  supabaseGetUserMock.mockResolvedValue({ data: { user: null } });
});

describe('setLocaleAction — input validation', () => {
  it('rejects an unknown locale string', async () => {
    const result = await setLocaleAction('pt-PT');
    expect(result).toEqual({ ok: false, errorCode: 'errors.locale.invalid' });
    // None of the side-effects fire when input is invalid.
    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('rejects a non-string input (number)', async () => {
    const result = await setLocaleAction(42);
    expect(result).toEqual({ ok: false, errorCode: 'errors.locale.invalid' });
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it('rejects null / undefined input', async () => {
    expect(await setLocaleAction(null)).toEqual({ ok: false, errorCode: 'errors.locale.invalid' });
    expect(await setLocaleAction(undefined)).toEqual({
      ok: false,
      errorCode: 'errors.locale.invalid',
    });
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it.each(['fr-BE', 'en', 'nl-BE', 'de-DE', 'es-ES'])(
    'accepts each entry in LOCALES (%s)',
    async (locale) => {
      const result = await setLocaleAction(locale);
      expect(result).toEqual({ ok: true });
    },
  );
});

describe('setLocaleAction — anonymous user side-effects', () => {
  it('writes the NEXT_LOCALE cookie with the documented attributes', async () => {
    await setLocaleAction('en');

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    expect(cookieSetMock).toHaveBeenCalledWith('NEXT_LOCALE', 'en', {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      // NODE_ENV is 'test' inside Vitest, so secure is false here.
      // The prod build flips this to true via `process.env.NODE_ENV === 'production'`.
      secure: false,
      path: '/',
    });
  });

  it('writes the same cookie shape for nl-BE (parity with legacy spec)', async () => {
    await setLocaleAction('nl-BE');
    expect(cookieSetMock).toHaveBeenCalledWith(
      'NEXT_LOCALE',
      'nl-BE',
      expect.objectContaining({ sameSite: 'lax', path: '/' }),
    );
  });

  it('does NOT call supabase.from when no user is authenticated', async () => {
    await setLocaleAction('en');
    // We still createClient() + auth.getUser() to know the auth state,
    // but the DB write only fires for authenticated users.
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(supabaseGetUserMock).toHaveBeenCalledTimes(1);
    expect(supabaseFromMock).not.toHaveBeenCalled();
    expect(supabaseUpdateMock).not.toHaveBeenCalled();
  });

  it("invalidates the RSC cache layout-wide via revalidatePath('/', 'layout')", async () => {
    await setLocaleAction('en');

    // THI-276 PR-BETA-2bis contract — without this call, `<Link>`
    // entries prefetched by Next 16 keep their old-locale RSC payload
    // and the next client navigation serves them from cache,
    // re-introducing TICKET 7 (mobile iPhone Safari bug).
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });
});

describe('setLocaleAction — authenticated user side-effects', () => {
  beforeEach(() => {
    supabaseGetUserMock.mockResolvedValue({ data: { user: { id: 'user-123' } } });
  });

  it('persists the locale on the users row keyed by the authenticated user id', async () => {
    await setLocaleAction('en');

    expect(supabaseFromMock).toHaveBeenCalledWith('users');
    expect(supabaseUpdateMock).toHaveBeenCalledWith({ locale: 'en' });
    expect(supabaseEqMock).toHaveBeenCalledWith('id', 'user-123');
  });

  it('still writes the cookie + revalidates the cache (cookie is the primary persistence)', async () => {
    await setLocaleAction('fr-BE');

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    expect(cookieSetMock).toHaveBeenCalledWith(
      'NEXT_LOCALE',
      'fr-BE',
      expect.objectContaining({ path: '/' }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });
});

describe('setLocaleAction — side-effect ordering', () => {
  it('runs side-effects in order: cookie write → supabase auth → revalidatePath (anonymous)', async () => {
    const callOrder: string[] = [];

    cookieSetMock.mockImplementation(() => {
      callOrder.push('cookie.set');
    });
    supabaseGetUserMock.mockImplementation(async () => {
      callOrder.push('supabase.getUser');
      return { data: { user: null } };
    });
    revalidatePathMock.mockImplementation(() => {
      callOrder.push('revalidatePath');
    });

    await setLocaleAction('en');

    // Architectural invariant — the cookie MUST be persisted (and the
    // optional users.locale row MUST be updated) BEFORE the cache
    // invalidation fires. If `revalidatePath` ran first, an in-flight
    // RSC refetch could read the OLD cookie value and re-render in the
    // previous locale, re-introducing the TICKET 7 race condition.
    expect(callOrder).toEqual(['cookie.set', 'supabase.getUser', 'revalidatePath']);
  });

  it('runs supabase.update BEFORE revalidatePath for authenticated users', async () => {
    const callOrder: string[] = [];
    supabaseGetUserMock.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    cookieSetMock.mockImplementation(() => {
      callOrder.push('cookie.set');
    });
    supabaseEqMock.mockImplementation(async () => {
      callOrder.push('supabase.update.eq');
      return { data: null, error: null };
    });
    revalidatePathMock.mockImplementation(() => {
      callOrder.push('revalidatePath');
    });

    await setLocaleAction('en');

    expect(callOrder).toEqual(['cookie.set', 'supabase.update.eq', 'revalidatePath']);
  });
});
