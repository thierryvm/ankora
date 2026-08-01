import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserMock = vi.fn();
const createClientMock = vi.fn(async () => ({
  auth: {
    getUser: () => getUserMock(),
  },
}));

const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

// This suite covers `getOptionalUser` only, but the module under test now
// imports the locale-aware `redirect`. Stub the barrel so next-intl's ESM build
// stays out of the Vitest module graph (it fails to resolve `next/navigation`
// there). The redirecting branches are covered in `require-user-redirects.test.ts`.
vi.mock('@/i18n/navigation', () => ({
  redirect: () => {
    throw new Error('NEXT_REDIRECT');
  },
}));

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr-BE',
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

// Stub `@/lib/log` so the test runner doesn't have to parse `@/lib/env` (which
// fails without Supabase env vars in test context) AND so we can assert the
// instrumentation triggers on the right branches.
vi.mock('@/lib/log', () => ({
  log: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: logWarnMock,
    error: logErrorMock,
    fatal: vi.fn(),
    child: vi.fn(),
  },
}));

import { AUTH_BACKEND_UNAVAILABLE_DIGEST } from '../auth-error';
import { AuthBackendUnavailableError, getOptionalUser, requireUser } from '../require-user';

const fakeUser = {
  id: 'user-123',
  email: 'thierry@example.test',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  getUserMock.mockReset();
  createClientMock.mockClear();
  logWarnMock.mockReset();
  logErrorMock.mockReset();
});

describe('getOptionalUser() — non-redirecting session check', () => {
  it('returns null when supabase reports no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const result = await getOptionalUser();

    expect(result).toBeNull();
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when supabase returns an auth error', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', message: 'JWT expired', status: 401, __isAuthError: true },
    });

    const result = await getOptionalUser();

    expect(result).toBeNull();
  });

  it('returns the user when session is valid', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });

    const result = await getOptionalUser();

    expect(result).toEqual(fakeUser);
  });

  it('still degrades to null when Supabase is unreachable', async () => {
    // Correct FOR THIS FUNCTION and only for it: a marketing page must render
    // anonymous chrome rather than 500. `requireUser` makes the opposite call —
    // see the outage suite below.
    getUserMock.mockRejectedValueOnce(new Error('Network down'));

    await expect(getOptionalUser()).resolves.toBeNull();
  });
});

/**
 * The instrumentation contract, rewritten on 2026-07-30.
 *
 * It used to assert `[503-diag]` prefixed warnings on every failure path. Those
 * were explicitly temporary — `require-user.ts` carried "Remove this helper +
 * every `[503-diag]` log call once Étape 2 has shipped the targeted fix" — and
 * they encoded the thing that turned out to be wrong: that every failure is the
 * same kind of failure, worth the same log level. Flattening an outage and an
 * expired session into one `warn` is precisely what let a Supabase outage read as
 * "users keep having to sign in again".
 *
 * The replacement contract is stronger, not weaker: an outage must be `error`
 * (it is an incident), an ended session must not be logged as one, and the
 * nominal path must stay silent.
 */
describe('getOptionalUser() — an outage is reported as an incident, not as a logout', () => {
  it('logs at error level when the backend is unreachable', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 0, __isAuthError: true },
    });

    await getOptionalUser();

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    const [msg, bindings] = logErrorMock.mock.calls[0] ?? [];
    expect(msg).toMatch(/unavailable/i);
    expect(msg).toContain('getOptionalUser');
    expect(bindings).toMatchObject({ name: 'AuthRetryableFetchError' });
  });

  it('does not report an ended session as an incident', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: {
        name: 'AuthApiError',
        message: 'Invalid Refresh Token: Refresh Token Not Found',
        status: 400,
        code: 'refresh_token_not_found',
        __isAuthError: true,
      },
    });

    await getOptionalUser();

    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it('stays silent when the session is valid', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });

    await getOptionalUser();

    expect(logWarnMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });
});

/**
 * The measured defect, locked. On 2026-07-30, with Supabase unreachable and a
 * perfectly valid session, `/app` answered `307 → /login`: an outage was being
 * laundered into a mass logout, and the incident was invisible because it looked
 * like ordinary session churn.
 */
describe('requireUser() — an outage surfaces, an expired session redirects', () => {
  it('throws AuthBackendUnavailableError when the backend is unreachable', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 0, __isAuthError: true },
    });

    await expect(requireUser()).rejects.toBeInstanceOf(AuthBackendUnavailableError);
  });

  // Without the digest the throw reaches `[locale]/error.tsx` anonymous and the
  // visitor is told "Quelque chose s'est cassé" — a crash message for a
  // dependency blip, with their session still perfectly valid. React strips the
  // message, name and stack in production; `digest` is the only field that
  // crosses, so it is the whole contract.
  it('carries the digest the error boundary needs to show the outage screen', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 0, __isAuthError: true },
    });

    const thrown = await requireUser().catch((e: unknown) => e);

    expect((thrown as { digest?: string }).digest).toBe(AUTH_BACKEND_UNAVAILABLE_DIGEST);
  });

  it('throws — never redirects — when getUser() throws outright', async () => {
    getUserMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    // The redirect stub for this file throws `NEXT_REDIRECT`; asserting on the
    // error type is what distinguishes "surfaced" from "silently logged out".
    await expect(requireUser()).rejects.toBeInstanceOf(AuthBackendUnavailableError);
  });

  it.each([500, 503, 429])('throws rather than redirecting on a %s', async (status) => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', status, message: 'upstream', __isAuthError: true },
    });

    await expect(requireUser()).rejects.toBeInstanceOf(AuthBackendUnavailableError);
  });

  it('redirects — does NOT 500 — when the session cookie is unreadable', async () => {
    // The regression this assertion exists for: the first cut of the classifier
    // called a decode failure an outage, so `/app` answered 500 with the corrupt
    // cookie still set. Measured 2026-07-30. Purge-and-login is recoverable; a 500
    // caused by the cookie itself is not.
    getUserMock.mockRejectedValueOnce(new Error('Invalid Base64-URL character "%" at position 3'));

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('redirects — does NOT throw an outage — when the refresh token is dead', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: {
        name: 'AuthApiError',
        message: 'Invalid Refresh Token: Refresh Token Not Found',
        status: 400,
        code: 'refresh_token_not_found',
        __isAuthError: true,
      },
    });

    // `NEXT_REDIRECT` comes from this file's `@/i18n/navigation` stub — reaching
    // it proves the expired session took the login path, not the outage path.
    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('returns the user untouched when the session is valid', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });

    await expect(requireUser()).resolves.toEqual(fakeUser);
  });
});
