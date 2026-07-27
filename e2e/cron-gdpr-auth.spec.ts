import { test, expect } from './helpers/test';

/**
 * `/api/cron/gdpr` is the only endpoint in Ankora that can destroy an account,
 * and it is PUBLIC — reachable by anyone who knows the path.
 *
 * ## What these cases prove, and what they DO NOT
 *
 * `CRON_SECRET` is defined in **no** `env` block of `.github/workflows/ci.yml`,
 * so in CI the route exits through its very first branch — the one that answers
 * 401 because nothing is configured. These cases therefore prove exactly one
 * thing: **the route refuses over real HTTP, and refuses by default.** That is
 * worth having; a route can pass every unit test and still be reachable.
 *
 * They do NOT reach `secretMatches()`. Measured by `silent-failure-auditor` on
 * 2026-07-27: replacing the body of `secretMatches` with `return true` would
 * leave every case here green. The constant-time comparison, the SHA-256 on
 * both sides and the wrong-length case are proven in
 * `src/app/api/cron/gdpr/__tests__/route.test.ts` instead — where the
 * environment can be controlled.
 *
 * An earlier version of this file claimed otherwise in its comments, and
 * carried a fourth case asserting that the two refusals are indistinguishable.
 * In CI they are literally the same branch, so that assertion could not fail:
 * it was removed rather than left to look like a guard.
 *
 * Closing the gap needs `CRON_SECRET` in the e2e job's environment — a 32-char
 * dummy, not a secret. Editing `.github/workflows/` is a banned action in a
 * feature PR (CLAUDE.md), so it ships in a dedicated PR with the missing case
 * nothing anywhere covers today: **a 200 over HTTP with the right secret.**
 */
test.describe('GDPR cron endpoint — refuses by default', () => {
  test('401s without an Authorization header', async ({ request }) => {
    const res = await request.get('/api/cron/gdpr');
    expect(res.status()).toBe(401);
  });

  test('401s with a Bearer token', async ({ request }) => {
    const res = await request.get('/api/cron/gdpr', {
      headers: { authorization: `Bearer ${'b'.repeat(32)}` },
    });
    expect(res.status()).toBe(401);
  });

  test('401s rather than 500s on a token of the wrong length', async ({ request }) => {
    // Weaker than it reads: in CI this never reaches `timingSafeEqual`, so it
    // cannot show that hashing both sides is what stops the throw. It still
    // rules out the route 500ing on a malformed header, which is a real answer
    // over a real socket.
    const res = await request.get('/api/cron/gdpr', {
      headers: { authorization: 'Bearer short' },
    });
    expect(res.status()).toBe(401);
  });
});
