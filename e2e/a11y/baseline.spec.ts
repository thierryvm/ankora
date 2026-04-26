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
      // `waitUntil: 'load'` fires after the load event — DOM + sub-resources
      // (CSS, fonts, images) are ready, which is what axe needs to compute
      // contrast and detect missing labels. We intentionally do NOT wait for
      // `networkidle`: with Next.js prefetch + dev tooling on the preview,
      // the network rarely goes idle within Playwright's 15s budget and
      // every test times out (observed on PR #69 / run 24966447424).
      await page.goto(route.path, { waitUntil: 'load' });
      await expectA11yPass(page);
    });
  }
});
