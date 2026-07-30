import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Locale-aware server redirects — `requireUser` / `requireUserWithWorkspace`.
 *
 * Why this file exists. `localePrefix: 'as-needed'` puts French on unprefixed
 * URLs, so `/login` IS the French login page. Until #258, a bare
 * `redirect('/login')` was rescued downstream: next-intl's `localeDetection`
 * read the NEXT_LOCALE cookie and 307'd the request to `/en/login`. #258 turned
 * that detection off (it was the same gate that let a background prefetch
 * silently rewrite the user's language), so the rescue is gone and every bare
 * redirect now lands an English user on a French page.
 *
 * These branches had ZERO coverage before: the neighbouring
 * `require-user.test.ts` exercises `getOptionalUser` only — it never imports
 * `requireUser`, and never mocks `next/navigation`.
 *
 * The `redirect` mock THROWS on purpose, mirroring `require-admin.test.ts`. A
 * no-op mock would let `requireUser` fall through and return `undefined as
 * User`, so the test would stay green over a guard that no longer guards —
 * the exact failure mode this suite is meant to catch.
 *
 * Note on coverage honesty: the authenticated Playwright specs are skipped in
 * CI (no `E2E_*` secrets — one Supabase project, service_role key must not
 * reach CI). These unit tests are therefore the only automated net for this
 * regression class, not a complement to an E2E one.
 */

const redirectMock = vi.hoisted(() =>
  vi.fn((_args?: unknown): never => {
    throw new Error('NEXT_REDIRECT');
  }),
);
const getLocaleMock = vi.hoisted(() => vi.fn(async () => 'fr-BE'));
const getUserMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock('@/i18n/navigation', () => ({
  redirect: (args: unknown) => redirectMock(args),
}));

vi.mock('next-intl/server', () => ({
  getLocale: () => getLocaleMock(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: () => getUserMock() },
    from: (table: string) => fromMock(table),
  }),
}));

vi.mock('@/lib/log', () => ({
  log: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  },
}));

import { DataReadUnavailableError } from '@/lib/data/read-failure';

import { requireUser, requireUserWithWorkspace } from '../require-user';

const fakeUser = {
  id: 'user-123',
  email: 'thierry@example.test',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
};

/** Minimal chainable stub for `.from(...).select(...)…maybeSingle()`. */
function membershipQuery(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
  };
  return chain;
}

beforeEach(() => {
  redirectMock.mockClear();
  getLocaleMock.mockClear();
  getLocaleMock.mockResolvedValue('fr-BE');
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe('requireUser — the login redirect carries the locale', () => {
  it('sends an English visitor to the English login page', async () => {
    getLocaleMock.mockResolvedValue('en');
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith({ href: '/login', locale: 'en' });
  });

  it('sends a French visitor to the French login page', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith({ href: '/login', locale: 'fr-BE' });
  });

  it('does not redirect when a session exists', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });

    await expect(requireUser()).resolves.toMatchObject({ id: 'user-123' });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('requireUserWithWorkspace — the onboarding redirect carries the locale', () => {
  it('sends an English visitor without a workspace to the English onboarding', async () => {
    getLocaleMock.mockResolvedValue('en');
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });
    fromMock.mockReturnValue(membershipQuery({ data: null, error: null }));

    await expect(requireUserWithWorkspace()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith({ href: '/onboarding', locale: 'en' });
  });

  it('returns the membership when there is one, without redirecting', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });
    fromMock.mockReturnValue(
      membershipQuery({ data: { workspace_id: 'ws-1', role: 'owner' }, error: null }),
    );

    await expect(requireUserWithWorkspace()).resolves.toMatchObject({
      workspaceId: 'ws-1',
      role: 'owner',
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

/**
 * "You have no workspace" and "I could not read your workspace" are different
 * sentences, and until 2026-07-30 this function said the first one for both.
 *
 * The harm is specific to what Ankora is. Someone who tracks their budget here
 * opens the app, is asked to create their space again, and the only reasonable
 * conclusion is that their data is gone. It is not: a SELECT failed. The
 * information to tell them apart was already being computed — the previous
 * version put `hadError` in a log line and then routed identically either way.
 */
describe('requireUserWithWorkspace — an unreadable membership is not an absent one', () => {
  const readFailures = [
    ['a connection failure', { code: '08006', message: 'connection failure' }],
    ['an RLS denial', { code: '42501', message: 'permission denied' }],
    ['a statement timeout', { code: '57014', message: 'canceling statement' }],
  ] as const;

  it.each(readFailures)('throws instead of redirecting to onboarding on %s', async (_l, error) => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });
    fromMock.mockReturnValue(membershipQuery({ data: null, error }));

    await expect(requireUserWithWorkspace()).rejects.toBeInstanceOf(DataReadUnavailableError);
    // The assertion that matters: the visitor was NOT walked into onboarding.
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('still redirects to onboarding when the read succeeded and found nothing', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });
    fromMock.mockReturnValue(membershipQuery({ data: null, error: null }));

    await expect(requireUserWithWorkspace()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith({ href: '/onboarding', locale: 'fr-BE' });
  });

  it('carries the digest that renders the "cannot load your data" screen', async () => {
    getUserMock.mockResolvedValue({ data: { user: fakeUser }, error: null });
    fromMock.mockReturnValue(membershipQuery({ data: null, error: { code: '08006' } }));

    const thrown = await requireUserWithWorkspace().catch((e: unknown) => e);

    expect((thrown as { digest?: string }).digest).toBe('ANKORA_DATA_READ_UNAVAILABLE');
  });
});

describe('the guard cannot be silently defeated', () => {
  it('never returns a user when the session is missing', async () => {
    // Guards against the failure mode a non-throwing redirect mock would hide:
    // if `redirect` stopped terminating, `requireUser` would fall through and
    // hand back `undefined` typed as `User`, and every caller would treat the
    // visitor as authenticated.
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const outcome = await requireUser().then(
      (value) => ({ returned: value }),
      (error: Error) => ({ threw: error.message }),
    );

    expect(outcome).toEqual({ threw: 'NEXT_REDIRECT' });
  });
});
