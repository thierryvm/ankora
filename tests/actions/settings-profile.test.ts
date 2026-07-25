import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `updateProfileAction` — the language preference must not travel through it.
 *
 * It used to write `users.locale` alongside the display name, which made it a
 * second writer of a preference `setLocaleAction` already owned. Only the
 * latter writes the NEXT_LOCALE cookie and revalidates the root layout, so a
 * language saved from Settings changed a database column and nothing else —
 * the rendered locale comes from the URL prefix alone since the routing config
 * stopped reading the cookie.
 *
 * The Settings selector was the visible casualty: it offered `fr-FR` and
 * `en-GB`, neither of which exists in `LOCALES`, so every choice but `fr-BE`
 * failed validation with a generic error toast.
 *
 * These specs pin the payload actually sent to Supabase, which is the only
 * place the regression could come back unnoticed — the schema no longer even
 * types `locale`, so a plain type check would not catch a hand-written update.
 */

const updateSpy = vi.hoisted(() =>
  vi.fn<(payload: Record<string, unknown>) => { eq: () => Promise<{ error: null }> }>(() => ({
    eq: async () => ({ error: null }),
  })),
);
const revalidateAppPathSpy = vi.hoisted(() => vi.fn());

// `@/lib/log` pulls in `@/lib/env`, which throws at module load without the
// Supabase env vars — the same stub the auth guard suites use.
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

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: async () => ({ success: true, limit: 10, remaining: 9, reset: 0 }),
}));

vi.mock('@/lib/actions/revalidate', () => ({
  revalidateAppPath: (...args: unknown[]) => revalidateAppPathSpy(...args),
  revalidateDashboard: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-123', email: 'thierry@example.test' } }, error: null };
      },
    },
    from: () => ({ update: updateSpy }),
  }),
}));

import { updateProfileAction } from '@/lib/actions/settings';

beforeEach(() => {
  updateSpy.mockClear();
  revalidateAppPathSpy.mockClear();
});

describe('updateProfileAction', () => {
  it('writes the display name', async () => {
    const res = await updateProfileAction({ displayName: 'Thierry' });

    expect(res).toEqual({ ok: true });
    expect(updateSpy).toHaveBeenCalledWith({ display_name: 'Thierry' });
  });

  it('never writes a locale, even when an older client still sends one', async () => {
    // Deploy skew: a tab running the previous bundle keeps posting `locale`.
    // Zod strips it, and the update payload must stay clean — otherwise the
    // second writer is back and the user's language gets overwritten on every
    // profile save.
    await updateProfileAction({ displayName: 'Thierry', locale: 'en' });

    expect(updateSpy).toHaveBeenCalledWith({ display_name: 'Thierry' });
    const [payload] = updateSpy.mock.calls[0] ?? [];
    expect(payload as Record<string, unknown> | undefined).not.toHaveProperty('locale');
  });

  it('rejects an empty display name without touching the database', async () => {
    const res = await updateProfileAction({ displayName: '   ' });

    expect(res.ok).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
