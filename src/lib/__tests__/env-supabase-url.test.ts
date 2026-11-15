// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `src/lib/env.ts` validates NEXT_PUBLIC_SUPABASE_URL with `supabaseUrlSchema`,
 * so a URL the CSP cannot name fails at load (the build) instead of on every
 * proxied request. `supabase-url.test.ts` covers the rule; this file proves the
 * env module actually applies it. Values are fictitious.
 */

const VALID_ENV = {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_ENV: 'development',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  INTERNAL_SECRET: 'x'.repeat(32),
};

function stubEnv(overrides: Partial<typeof VALID_ENV> = {}) {
  for (const [key, value] of Object.entries({ ...VALID_ENV, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('env — NEXT_PUBLIC_SUPABASE_URL', () => {
  it('loads with a plain http(s) Supabase URL', async () => {
    stubEnv();

    const { env } = await import('@/lib/env');
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54421');
  });

  it.each([
    ['a non-http scheme', 'ftp://abcdefghijklmnopqrst.supabase.co'],
    ['a directive separator in the host', 'https://abcdefghijklmnopqrst.supabase.co;script-src'],
  ])('refuses to load with %s', async (_label, url) => {
    stubEnv({ NEXT_PUBLIC_SUPABASE_URL: url });

    await expect(import('@/lib/env')).rejects.toThrow('Invalid server environment variables');
  });
});
