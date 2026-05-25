import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PR-BETA-CLEANUP (THI-279, 2026-05-25) — callback locale preservation.
 *
 * Specs lock the contract that the OAuth redirect URL carries the locale
 * prefix the visitor was on before clicking "Sign in". Without it, a
 * visitor coming from `/en` lands back on the landing (`/en?code=…`) after
 * Supabase Google OAuth instead of `/en/app`, because `NextResponse.redirect`
 * has no implicit locale awareness — see incident smoke @thierry on
 * PR #182 preview (2026-05-25).
 *
 * Cookies / Supabase / Next types are all stubbed so the route can be
 * exercised without a real Supabase instance. Each spec controls:
 *   - `NEXT_LOCALE` cookie value via `setLocaleCookie()`
 *   - Supabase session + profile state via `setSupabaseFixtures()`
 *   - Query string (`code`, `next`) via the input URL
 */

const cookieRef = { value: undefined as string | undefined };

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'NEXT_LOCALE' && cookieRef.value ? { value: cookieRef.value } : undefined,
  }),
}));

// Stub Supabase to fully control the auth flow without env / network.
type SupabaseFixtures = {
  exchangeError: { message: string } | null;
  userId: string | null;
  onboardedAt: string | null;
};

const supabaseRef: SupabaseFixtures = {
  exchangeError: null,
  userId: 'user-thierry',
  onboardedAt: '2026-04-23T00:00:00.000Z',
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({ error: supabaseRef.exchangeError })),
      getUser: vi.fn(async () => ({
        data: { user: supabaseRef.userId ? { id: supabaseRef.userId } : null },
      })),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: supabaseRef.onboardedAt ? { onboarded_at: supabaseRef.onboardedAt } : null,
          }),
        }),
      }),
    }),
  }),
}));

import { GET } from '../route';

function setLocaleCookie(locale: string | undefined): void {
  cookieRef.value = locale;
}

function setSupabaseFixtures(fixtures: Partial<SupabaseFixtures>): void {
  Object.assign(supabaseRef, fixtures);
}

function buildRequest(search: string): import('next/server').NextRequest {
  // Minimal NextRequest shim — the route handler only uses `request.url`.
  return { url: `https://ankora.be/auth/callback${search}` } as import('next/server').NextRequest;
}

beforeEach(() => {
  cookieRef.value = undefined;
  Object.assign(supabaseRef, {
    exchangeError: null,
    userId: 'user-thierry',
    onboardedAt: '2026-04-23T00:00:00.000Z',
  } satisfies SupabaseFixtures);
});

describe('auth/callback — locale preservation (PR-BETA-CLEANUP / THI-279)', () => {
  it('redirects to /app (unprefixed) when the visitor was on the default locale fr-BE', async () => {
    setLocaleCookie('fr-BE');
    const response = await GET(buildRequest('?code=test-code'));
    expect(response.headers.get('location')).toBe('https://ankora.be/app');
  });

  it('redirects to /en/app when the visitor was on EN before OAuth', async () => {
    setLocaleCookie('en');
    const response = await GET(buildRequest('?code=test-code'));
    expect(response.headers.get('location')).toBe('https://ankora.be/en/app');
  });

  it('redirects to /de-DE/app when the visitor was on DE before OAuth', async () => {
    setLocaleCookie('de-DE');
    const response = await GET(buildRequest('?code=test-code'));
    expect(response.headers.get('location')).toBe('https://ankora.be/de-DE/app');
  });

  it('falls back to the default locale fr-BE (unprefixed) when no cookie is present', async () => {
    setLocaleCookie(undefined);
    const response = await GET(buildRequest('?code=test-code'));
    expect(response.headers.get('location')).toBe('https://ankora.be/app');
  });

  it('rejects a spoofed locale cookie and falls back to fr-BE', async () => {
    setLocaleCookie('zz-ZZ');
    const response = await GET(buildRequest('?code=test-code'));
    expect(response.headers.get('location')).toBe('https://ankora.be/app');
  });

  it('prefixes the /onboarding target for a fresh non-onboarded user', async () => {
    setLocaleCookie('en');
    setSupabaseFixtures({ onboardedAt: null });
    const response = await GET(buildRequest('?code=test-code'));
    expect(response.headers.get('location')).toBe('https://ankora.be/en/onboarding');
  });

  it('honours the safe `next` query param and prefixes it with the locale', async () => {
    setLocaleCookie('en');
    const response = await GET(buildRequest('?code=test-code&next=/app/settings'));
    expect(response.headers.get('location')).toBe('https://ankora.be/en/app/settings');
  });

  it('rejects a protocol-relative `next` and falls back to /app', async () => {
    setLocaleCookie('en');
    const response = await GET(buildRequest('?code=test-code&next=//evil.example.com'));
    expect(response.headers.get('location')).toBe('https://ankora.be/en/app');
  });

  it('prefixes the /login error redirect when the code is missing', async () => {
    setLocaleCookie('en');
    const response = await GET(buildRequest(''));
    expect(response.headers.get('location')).toBe('https://ankora.be/en/login?error=missing_code');
  });

  it('prefixes the /login redirect when the Supabase code exchange fails', async () => {
    setLocaleCookie('en');
    setSupabaseFixtures({ exchangeError: { message: 'invalid_grant' } });
    const response = await GET(buildRequest('?code=bad-code'));
    expect(response.headers.get('location')).toBe(
      'https://ankora.be/en/login?error=exchange_failed',
    );
  });

  it('prefixes the /login redirect when getUser returns null', async () => {
    setLocaleCookie('en');
    setSupabaseFixtures({ userId: null });
    const response = await GET(buildRequest('?code=test-code'));
    expect(response.headers.get('location')).toBe('https://ankora.be/en/login');
  });
});
