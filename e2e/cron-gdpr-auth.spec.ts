import { test, expect } from './helpers/test';

/**
 * `/api/cron/gdpr` is the only endpoint in Ankora that can destroy an account,
 * and it is PUBLIC — reachable by anyone who knows the path. Everything that
 * stops a stranger from firing it is one Bearer comparison.
 *
 * These cases run in the public e2e job, against the deployed build, without
 * any Supabase. That is deliberate: they must hold on a real HTTP surface, not
 * only in a unit test where the route is imported as a function.
 */
test.describe('GDPR cron endpoint — refuses by default', () => {
  test('401s without an Authorization header', async ({ request }) => {
    const res = await request.get('/api/cron/gdpr');
    expect(res.status()).toBe(401);
  });

  test('401s with a wrong Bearer token', async ({ request }) => {
    const res = await request.get('/api/cron/gdpr', {
      headers: { authorization: `Bearer ${'b'.repeat(32)}` },
    });
    expect(res.status()).toBe(401);
  });

  test('401s rather than 500s on a token of the wrong length', async ({ request }) => {
    // `timingSafeEqual` throws on unequal buffer lengths. Without the SHA-256 on
    // both sides this returns 500, and the status code alone tells an attacker
    // when they have guessed the right length.
    const res = await request.get('/api/cron/gdpr', {
      headers: { authorization: 'Bearer short' },
    });
    expect(res.status()).toBe(401);
  });

  test('never says which of the two refusals it was', async ({ request }) => {
    // A missing CRON_SECRET and a wrong token must be indistinguishable to the
    // caller — the difference lives only in our logs.
    const missing = await request.get('/api/cron/gdpr');
    const wrong = await request.get('/api/cron/gdpr', {
      headers: { authorization: `Bearer ${'c'.repeat(32)}` },
    });

    expect(missing.status()).toBe(wrong.status());
    expect(await missing.json()).toEqual(await wrong.json());
  });
});
