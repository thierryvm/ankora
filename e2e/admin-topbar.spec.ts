import { test, expect } from '@playwright/test';

/**
 * Smoke tests for the admin topbar consumer integration (PR-D4-PHASE2-B).
 *
 * Scope intentionally narrow — full auth → admin → locale switch flow
 * requires an E2E auth fixture (storageState with a seeded admin Supabase
 * user) that does not yet exist in this repo. That fixture is a separate
 * infra task. For now we validate:
 *
 * 1. RBAC guard active: unauthenticated GET to `/[locale]/admin` redirects
 *    to /login. Confirms `requireAdmin()` → `requireUser()` chain is wired.
 *
 * Additional consumer-integration coverage lives in Vitest unit tests
 * (LangSwitcherClient mocks the next-intl router, AdminTopbar tests cookie
 * SSR seeding) and in the existing `design-playground.spec.ts` smoke that
 * already exercises the atoms in isolation.
 */
test.describe('Admin topbar consumer (PR-D4-PHASE2-B)', () => {
  test('unauthenticated GET to /fr-BE/admin redirects to /login', async ({ page }) => {
    const response = await page.goto('/fr-BE/admin');
    // Final URL after redirect chain should land on /login (with optional
    // locale prefix and any redirect query param).
    await expect(page).toHaveURL(/\/login(\?|$)/);
    // Response is OK because the redirect target page renders.
    expect(response?.ok()).toBe(true);
  });
});
