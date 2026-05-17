import { test, expect } from '@playwright/test';

// Mobile viewport: typical iOS/Android dimensions
const MOBILE_VIEWPORT = { width: 375, height: 667 };

// NOTE: This test suite runs on chromium-desktop with mobile viewport (375×667).
// Tab key focus trap is desktop-only (keyboard input).
// Use case: user with mobile device + external Bluetooth keyboard.
// See: docs/architecture/accessibility.md#focus-trap-keyboard-interaction
// Excluded from mobile projects via playwright.config.ts testIgnore.
test.describe('Drawer Mobile Accessibility — Focus Trap (WCAG 2.1 2.4.3)', () => {
  test.beforeEach(async ({ page }) => {
    // Set mobile viewport to simulate mobile screen size on desktop browser
    await page.setViewportSize(MOBILE_VIEWPORT);
    // Navigate to marketing homepage (has HeaderNav without auth requirement)
    await page.goto('/', { waitUntil: 'load' });
    // Ensure hamburger menu is visible before running tests.
    // PR-D5 a11y: refactored from `<label htmlFor="menu-toggle">` + `<input
    // type="checkbox" hidden id="menu-toggle">` to a native `<button
    // aria-expanded aria-controls="mobile-nav-drawer">`. Selector adapted
    // accordingly.
    await page
      .locator('button[aria-controls="mobile-nav-drawer"]')
      .waitFor({ state: 'visible', timeout: 10_000 });
  });

  test('1. Tab cycle stays inside drawer when open', async ({ page }) => {
    // Open the drawer by clicking the hamburger button (PR-D5 refactor).
    const hamburger = page.locator('button[aria-controls="mobile-nav-drawer"]');
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    // Wait for drawer to become visible
    const drawer = page.locator('nav[role="dialog"]');
    await expect(drawer).toBeVisible();

    // Get all tabbable elements inside the drawer
    const firstLink = drawer.locator('a, button, [tabindex="0"]').first();
    await expect(firstLink).toBeVisible();

    // Move focus inside drawer
    await firstLink.focus();
    await expect(page.locator(':focus')).toBeTruthy();

    // Tab through elements — focus should remain in drawer
    const focusedElements: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      const isInDrawer = await drawer.evaluate((el) => el.contains(document.activeElement));

      if (!isInDrawer) {
        // If focus escaped, check if we're still in the drawer DOM
        const focusedElement =
          (await focused.getAttribute('aria-label')) || (await focused.textContent()) || 'unknown';
        focusedElements.push(focusedElement);
      }

      expect(isInDrawer).toBe(true);
    }
  });

  test('2. Escape key closes drawer', async ({ page }) => {
    // Open drawer (PR-D5 refactor: hamburger is now a real button with
    // aria-expanded reflecting the open state, replacing the previous
    // hidden checkbox `input#menu-toggle`).
    const hamburger = page.locator('button[aria-controls="mobile-nav-drawer"]');
    await hamburger.click();

    const drawer = page.locator('nav[role="dialog"]');
    // After PR-3c-2 HeaderNav refactor (commit f45da08), the drawer is
    // mounted/unmounted on `isOpen` (was `translate-x-*` slide pattern).
    // PR-D5: the open state is now exposed via `aria-expanded` on the
    // trigger button instead of a hidden checkbox `:checked` state.
    await expect(drawer).toBeVisible();
    await expect(hamburger).toHaveAttribute('aria-expanded', 'true');

    // Focus inside drawer to ensure keyboard listener is active
    const drawerLink = drawer.locator('a, button').first();
    await drawerLink.focus();

    // Press Escape — drawer should close and aria-expanded should flip
    // back to "false".
    await page.keyboard.press('Escape');
    await expect(hamburger).toHaveAttribute('aria-expanded', 'false', { timeout: 500 });
    await expect(drawer).toHaveCount(0);
  });

  test('3. Focus cycles within drawer with Tab (focus trap)', async ({ page }) => {
    // Open drawer (PR-D5 refactor: button trigger, see test 2).
    const hamburger = page.locator('button[aria-controls="mobile-nav-drawer"]');
    await hamburger.click();

    const drawer = page.locator('nav[role="dialog"]');
    // Drawer is mounted on `isOpen` (PR-3c-2 conditional render) — visibility
    // is the right semantic check, no longer the translate-x-0 class.
    await expect(drawer).toBeVisible();

    // Focus first element in drawer
    const firstElement = drawer.locator('a, button, [tabindex="0"]').first();
    await firstElement.focus();

    // Tab through drawer — should cycle back to first element
    const focusableElements = await drawer.locator('a, button, [tabindex="0"]').count();
    expect(focusableElements).toBeGreaterThan(0);

    // Press Tab multiple times
    for (let i = 0; i < focusableElements + 1; i++) {
      await page.keyboard.press('Tab');
    }

    // Focus should be back at or near first focusable element (demonstrating wrap-around)
    const focused = page.locator(':focus');
    const focusedParent = await focused.evaluate((el) => el.closest('nav[role="dialog"]'));
    expect(focusedParent).toBeTruthy();
  });

  test('4. Skip link is focusable and navigates to main', async ({ page }) => {
    // Skip link should be the first focusable element on page load
    await page.keyboard.press('Tab');
    const skipLink = page.locator('a[href="#main"]');
    await expect(skipLink).toBeFocused();

    // Skip link should be visible when focused
    const isVisible = await skipLink.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.position !== 'absolute' && style.clip === 'auto';
    });
    expect(isVisible).toBe(true);

    // Pressing Enter should focus the main element
    await skipLink.press('Enter');
    const mainElement = page.locator('#main');
    await expect(mainElement).toBeFocused();
  });
});
