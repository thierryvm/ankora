/**
 * bottom-tab-bar.spec.ts — PR-BETA-6 (THI-277, 2026-05-25).
 *
 * Apple-HIG Bottom Tab Bar regression coverage. The bar replaces the
 * right-to-left drawer for the `/app/*` surface on mobile. iPhone WebKit
 * is the canonical target — Safari WebKit ships the safe-area-inset
 * semantics, the rubber-band scroll, and the Liquid Glass `backdrop-blur`
 * that the design relies on.
 *
 * Specs use the shared `seededUser` fixture: each spec runs against a real
 * onboarded user inside Supabase and is auto-skipped when the env can't
 * provision one (no SUPABASE_SERVICE_ROLE_KEY in CI dummy environments).
 */

import { expect } from '@playwright/test';
import { test } from './fixtures/mobile-test';

test.describe('BottomTabBar — iPhone Safari WebKit (PR-BETA-6 / THI-277)', () => {
  test('renders 5 tabs on /app, hides the legacy hamburger drawer', async ({
    page,
    seededUser,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    // The bar lives at the bottom of the viewport, visible only ≤ 768px.
    await expect(page.getByTestId('bottom-tab-bar')).toBeVisible();
    await expect(page.getByTestId('bottom-tab-cockpit')).toBeVisible();
    await expect(page.getByTestId('bottom-tab-bills')).toBeVisible();
    await expect(page.getByTestId('bottom-tab-expenses')).toBeVisible();
    await expect(page.getByTestId('bottom-tab-simulate')).toBeVisible();
    await expect(page.getByTestId('bottom-tab-more')).toBeVisible();

    // The legacy hamburger trigger MUST NOT be rendered on /app/* for the
    // app variant — the BottomTabBar is the canonical mobile-nav surface.
    await expect(page.getByTestId('header-nav-trigger')).toHaveCount(0);
  });

  test('cockpit tab is marked aria-current on /app, switches when navigating', async ({
    page,
    seededUser,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('bottom-tab-cockpit')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('bottom-tab-bills').click();
    await page.waitForURL(/\/app\/charges/, { timeout: 10_000 });
    await expect(page.getByTestId('bottom-tab-bills')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('bottom-tab-cockpit')).not.toHaveAttribute('aria-current');

    await page.getByTestId('bottom-tab-expenses').click();
    await page.waitForURL(/\/app\/expenses/, { timeout: 10_000 });
    await expect(page.getByTestId('bottom-tab-expenses')).toHaveAttribute('aria-current', 'page');
  });

  test('More sheet opens via tap and closes via backdrop click', async ({ page, seededUser }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    await page.getByTestId('bottom-tab-more').click();
    await expect(page.getByTestId('more-sheet')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Plus' })).toBeVisible();

    // Sheet content sanity: at least the canonical Accounts + Settings links.
    await expect(page.getByTestId('more-sheet-link-accounts')).toBeVisible();
    await expect(page.getByTestId('more-sheet-link-settings')).toBeVisible();
    await expect(page.getByTestId('more-sheet-logout')).toBeVisible();

    // Backdrop tap dismisses (Apple iOS sheet behaviour parity).
    await page.getByTestId('more-sheet-backdrop').click();
    await expect(page.getByTestId('more-sheet')).toBeHidden();
  });

  test('More sheet closes on Escape and restores trigger focus', async ({ page, seededUser }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    await page.getByTestId('bottom-tab-more').click();
    await expect(page.getByTestId('more-sheet')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('more-sheet')).toBeHidden();
  });

  test('safe-area-inset-bottom reserved: bar sits flush at the bottom edge', async ({
    page,
    seededUser,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    const measurement = await page.getByTestId('bottom-tab-bar').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
      };
    });

    // The bar is anchored at the viewport bottom (allow a 2-px sub-pixel
    // rounding tolerance — emulators can report fractional values).
    expect(Math.abs(measurement.bottom - measurement.viewportHeight)).toBeLessThanOrEqual(2);
  });

  test('main content padding clears the bar (no hidden CTA under the tab bar)', async ({
    page,
    seededUser,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    const overlap = await page.evaluate(() => {
      const main = document.getElementById('main');
      const bar = document.querySelector('[data-testid="bottom-tab-bar"]');
      if (!main || !bar) return null;
      const mainRect = main.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      return {
        mainPaddingBottom: parseFloat(getComputedStyle(main).paddingBottom),
        barHeight: barRect.height,
        // True if the main content's *padded* bottom is at or above the
        // bar's top edge — content cleared.
        cleared: mainRect.bottom - mainRect.height + main.scrollHeight <= barRect.top + 200,
      };
    });

    expect(overlap, 'BottomTabBar / main relationship must be measurable').not.toBeNull();
    if (overlap) {
      // The `pb-24` (~96px) added in app/layout.tsx clears the 48-px bar +
      // the iPhone home indicator safe area + breathing room.
      expect(overlap.mainPaddingBottom).toBeGreaterThanOrEqual(48);
    }
  });
});

test.describe('BottomTabBar persistence — Hotfix Option A v3 (THI-277, 2026-05-25)', () => {
  // Verifies the persistent-bar contract on the surfaces that the iPhone
  // smoke 2026-05-25 flagged: /admin (admin sans retour) and the
  // resources pages (/faq, /legal/*, /glossaire). Each spec navigates
  // through the More sheet entries to the destination and asserts the
  // bar survives the navigation.

  test('Plus → FAQ keeps the bar visible on /faq', async ({ page, seededUser }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    await page.getByTestId('bottom-tab-more').click();
    await page.getByTestId('more-sheet-link-faq').click();
    await page.waitForURL(/\/faq\b/, { timeout: 10_000 });

    // The bar must STILL be mounted — this is the persistence contract
    // that the iPhone smoke 2026-05-25 surfaced as broken on PR #182 v1.
    await expect(page.getByTestId('bottom-tab-bar')).toBeVisible();
    await expect(page.getByTestId('bottom-tab-cockpit')).toBeVisible();
  });

  test('Plus → Privacy keeps the bar visible AND tap Cockpit returns to /app', async ({
    page,
    seededUser,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    await page.getByTestId('bottom-tab-more').click();
    await page.getByTestId('more-sheet-link-legal-privacy').click();
    await page.waitForURL(/\/legal\/privacy\b/, { timeout: 10_000 });
    await expect(page.getByTestId('bottom-tab-bar')).toBeVisible();

    // Return-to-cockpit affordance — the whole point of the persistent
    // bar pattern. Without this, the user is trapped (the bug @thierry
    // reported on 2026-05-25).
    await page.getByTestId('bottom-tab-cockpit').click();
    await page.waitForURL(/\/app\b/, { timeout: 10_000 });
    await expect(page.getByTestId('bottom-tab-cockpit')).toHaveAttribute('aria-current', 'page');
  });

  test('Footer is NOT hidden by the bar on /faq mobile (GDPR art. 7(3) reachability)', async ({
    page,
    seededUser,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    await page.goto('/faq');
    await page.waitForLoadState('networkidle');

    // Scroll to the bottom — the footer's CookiePreferencesLink must be
    // reachable (RGPD art. 7(3)). If the BottomTabBar overlapped, the
    // link would be hidden behind it.
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
    await page.waitForTimeout(300);

    const measurement = await page.evaluate(() => {
      const footer = document.querySelector('footer');
      const bar = document.querySelector('[data-testid="bottom-tab-bar"]');
      if (!footer || !bar) return null;
      const footerLinks = footer.querySelectorAll('a, button');
      const barRect = bar.getBoundingClientRect();
      const lastLink = footerLinks[footerLinks.length - 1];
      const lastLinkRect = lastLink?.getBoundingClientRect();
      return {
        lastLinkBottom: lastLinkRect?.bottom ?? 0,
        barTop: barRect.top,
        // The footer's bottom-most interactive element must sit ABOVE the
        // bar's top edge (allow a 4-px sub-pixel tolerance).
        cleared: lastLinkRect ? lastLinkRect.bottom <= barRect.top + 4 : false,
      };
    });

    expect(measurement).not.toBeNull();
    if (measurement) {
      expect(
        measurement.cleared,
        `Footer last link bottom=${measurement.lastLinkBottom}px must be ≤ bar top=${measurement.barTop}px`,
      ).toBe(true);
    }
  });

  test('More sheet exposes Cookie Preferences (GDPR mirror of the footer link)', async ({
    page,
    seededUser,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    await page.getByTestId('bottom-tab-more').click();
    await expect(page.getByTestId('more-sheet-cookie-preferences')).toBeVisible();
  });

  test('Anonymous visitor on /faq does NOT see the BottomTabBar', async ({ page }) => {
    // No login — the visitor is anonymous. The bar must not render even
    // though /faq is not in the excluded routes list, because the gate is
    // `isAuthenticated && !isExcludedRoute(...)`.
    await page.goto('/faq');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('bottom-tab-bar')).toHaveCount(0);
  });

  test('Anonymous visitor on landing does NOT see the BottomTabBar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('bottom-tab-bar')).toHaveCount(0);
  });
});
