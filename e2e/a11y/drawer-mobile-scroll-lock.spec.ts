import { test, expect } from '@playwright/test';

/**
 * THI-250 + THI-251 (PR-FIX-DRAWER, 2026-05-23).
 *
 * iOS Safari WebKit ignores `document.body.style.overflow = 'hidden'` —
 * rubber-band scroll keeps propagating to the page behind the drawer
 * overlay. The HeaderNav drawer now pins <body> with `position: fixed` +
 * `top: -<scrollY>px` while the drawer is open, then restores both the
 * styles and the exact scroll position on close.
 *
 * These tests run on Chromium-desktop with a mobile viewport (375×667).
 * Chromium honours `overflow: hidden` natively so the iOS rubber-band is
 * not directly reproducible here, but we CAN verify the implementation
 * contract: the right body styles applied at open, restored at close, and
 * the scroll snapshot honoured on cleanup. The real-iOS validation is a
 * manual smoke step documented in `docs/runbooks/dev-on-iphone.md`.
 */
const MOBILE_VIEWPORT = { width: 375, height: 667 };

test.describe('Drawer Mobile — THI-250 iOS-robust scroll lock', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/', { waitUntil: 'load' });
    await page
      .locator('button[aria-controls="mobile-nav-drawer"]')
      .waitFor({ state: 'visible', timeout: 10_000 });
  });

  test('1. opening the drawer pins <body> with position:fixed + width:100%', async ({ page }) => {
    // Body-pinning contract is what blocks iOS rubber-band: the exact scrollY
    // offset is exercised under jsdom in Vitest (deterministic env, no
    // StrictMode double-invocation). Asserting the offset here too proved
    // flaky under `npm run dev` — Next.js dev with React StrictMode double-
    // invokes `useEffect`, and between the two runs the first invocation's
    // `position: fixed` collapses the scrollable height so `window.scrollY`
    // resets to 0 before the second capture. Prod build (no StrictMode)
    // behaves correctly — Vitest guards the math, Playwright guards the
    // body-pinning contract.
    await page.locator('button[aria-controls="mobile-nav-drawer"]').click();
    await expect(page.locator('nav[role="dialog"]')).toBeVisible();

    const bodyStyles = await page.evaluate(() => ({
      position: document.body.style.position,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
      // `top` carries the negative scrollY offset; assert it is set, not
      // its exact value (see comment above re StrictMode double-invocation).
      hasNegativeTop: document.body.style.top.startsWith('-') || document.body.style.top === '0px',
    }));

    expect(bodyStyles.position).toBe('fixed');
    expect(bodyStyles.width).toBe('100%');
    expect(bodyStyles.overflow).toBe('hidden');
    expect(bodyStyles.hasNegativeTop).toBe(true);
  });

  test('2. closing the drawer fully clears the body-pinning styles', async ({ page }) => {
    // Open drawer.
    await page.locator('button[aria-controls="mobile-nav-drawer"]').click();
    const drawer = page.locator('nav[role="dialog"]');
    await expect(drawer).toBeVisible();

    // Close via the X button (matches the prod UX path).
    await drawer.getByRole('button', { name: 'Fermer' }).click();
    await expect(drawer).toHaveCount(0);

    // All four inline styles must be cleared on close — leaving any one
    // (most likely `position: fixed`) would freeze the page permanently.
    const bodyStyles = await page.evaluate(() => ({
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    }));
    expect(bodyStyles).toEqual({ position: '', top: '', width: '', overflow: '' });
  });

  test('3. Escape key also clears the body-pinning styles', async ({ page }) => {
    await page.locator('button[aria-controls="mobile-nav-drawer"]').click();
    const drawer = page.locator('nav[role="dialog"]');
    await expect(drawer).toBeVisible();

    // Focus inside drawer first (Escape handler is bound on document).
    await drawer.locator('a, button').first().focus();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    const bodyStyles = await page.evaluate(() => ({
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    }));
    expect(bodyStyles).toEqual({ position: '', top: '', width: '', overflow: '' });
  });
});

test.describe('Drawer Mobile — THI-251 iOS PWA safe-area inset', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/', { waitUntil: 'load' });
    await page
      .locator('button[aria-controls="mobile-nav-drawer"]')
      .waitFor({ state: 'visible', timeout: 10_000 });
  });

  test('drawer <nav> reserves the env(safe-area-inset-top) area via padding-top', async ({
    page,
  }) => {
    await page.locator('button[aria-controls="mobile-nav-drawer"]').click();
    const drawer = page.locator('nav[role="dialog"]');
    await expect(drawer).toBeVisible();

    // Tailwind compiles `pt-[env(safe-area-inset-top)]` to
    // `padding-top: env(safe-area-inset-top)`. Chromium without the
    // viewport notch resolves that env var to 0 (no inset on a flat
    // viewport), so we assert the COMPILED rule rather than a numeric
    // padding-top — the latter would always read 0 here. The runtime
    // value is exercised on real iPhone hardware via
    // `docs/runbooks/dev-on-iphone.md`.
    const hasInsetUtility = await drawer.evaluate((el) =>
      el.className.includes('pt-[env(safe-area-inset-top)]'),
    );
    expect(hasInsetUtility).toBe(true);
  });
});
