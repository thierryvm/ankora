import { test } from '@playwright/test';

import { expectA11yPass } from '../helpers/a11y';

/**
 * Baseline a11y scan for v1.0 publicly-accessible routes.
 *
 * Each route is scanned independently with axe-core (WCAG 2.1 AA).
 * Zero violations is the contract — any future PR that introduces a
 * regression on these routes will fail this gate before merge.
 *
 * Authenticated routes (`/app/*`) are intentionally not scanned here:
 * they require a Supabase test session that's not yet wired in CI
 * (cf. issue #35). T4 of ADR-006 will close that gap.
 *
 * Refs: ADR-006 §Phase T1 + docs/testing-strategy.md.
 */

const PUBLIC_ROUTES: ReadonlyArray<{ path: string; label: string }> = [
  { path: '/', label: 'Landing (marketing)' },
  { path: '/login', label: 'Login' },
  { path: '/signup', label: 'Signup' },
  { path: '/glossaire', label: 'Glossary index' },
  { path: '/legal/cgu', label: 'Legal — CGU' },
  { path: '/legal/privacy', label: 'Legal — Privacy' },
  { path: '/legal/cookies', label: 'Legal — Cookies' },
];

test.describe('a11y baseline — WCAG 2.1 AA on public routes', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.label} (${route.path}) has zero WCAG AA violations`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: 'load' });
      // Wait for any client hydration to settle before scanning.
      await page.waitForLoadState('networkidle');
      await expectA11yPass(page);
    });
  }
});
