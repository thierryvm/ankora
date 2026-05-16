import { test, expect } from '@playwright/test';

/**
 * Smoke tests for the admin topbar consumer integration (PR-D4-PHASE2-B).
 *
 * Scope intentionally narrow — full auth → admin → locale switch flow
 * requires an E2E auth fixture (storageState with a seeded admin Supabase
 * user) that does not yet exist in this repo. That fixture is a separate
 * infra task. For now we validate the minimum contract: a visitor without
 * a valid admin session must NEVER see admin chrome.
 *
 * Additional consumer-integration coverage lives in Vitest unit tests
 * (LangSwitcherClient mocks the next-intl router, AdminTopbar tests cookie
 * SSR seeding) and in the existing `design-playground.spec.ts` smoke that
 * already exercises the atoms in isolation.
 */
test.describe('Admin topbar consumer (PR-D4-PHASE2-B)', () => {
  // TODO(THI-181): add a dedicated E2E with real Upstash secrets (or fake
  // Redis service in CI) to cover the rate-limit-pass → requireUser →
  // redirect /login chain. Today CI runs `npm run build && npm run start`
  // (NODE_ENV=production) with `UPSTASH_REDIS_REST_URL=http://localhost:8079`
  // (dummy fallback) → Upstash throws → rate-limit fail-closed → notFound()
  // returns 404 instead of redirecting to /login. The assertion below
  // intentionally accepts 404 OR /login (both block admin exposure).
  // Linear: https://linear.app/thierryvm/issue/THI-181
  test('unauthenticated GET to /fr-BE/admin does not expose admin content', async ({ page }) => {
    const response = await page.goto('/fr-BE/admin');

    // Three acceptable end-states (all of them block admin exposure):
    //   - 200 on /login (rate-limit pass → requireUser → redirect chain)
    //   - 302 mid-redirect (rarely seen — Playwright follows by default)
    //   - 404 on /admin or /404 (rate-limit fail-closed → notFound())
    const status = response?.status() ?? 0;
    expect([200, 302, 404]).toContain(status);
    expect(page.url()).toMatch(/\/(login|admin|404)/);

    // Hard contract — independent of which path the request took:
    // AdminTopbar must not render its two distinctive text markers.
    await expect(page.getByText('Ankora · Admin')).toHaveCount(0);
    await expect(page.getByText('Zone admin · réservée fondateur')).toHaveCount(0);
  });
});
