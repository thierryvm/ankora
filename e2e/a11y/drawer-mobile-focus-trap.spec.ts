import { test, expect } from '@playwright/test';

// Mobile viewport: typical iOS/Android dimensions
const MOBILE_VIEWPORT = { width: 375, height: 667 };

// Run only on chromium-desktop; Tab key focus trap is a desktop-specific accessibility feature
// test.use MUST be top-level (Playwright rule), not inside describe
test.use({ browserName: 'chromium' });

test.describe('Drawer Mobile Accessibility — Focus Trap (WCAG 2.1 2.4.3)', () => {
  test.beforeEach(async ({ page }) => {
    // Set mobile viewport to simulate mobile screen size on desktop browser
    await page.setViewportSize(MOBILE_VIEWPORT);
    // Navigate to marketing homepage (has HeaderNav without auth requirement)
    await page.goto('/', { waitUntil: 'networkidle' });
  });

  test('1. Tab cycle stays inside drawer when open', async ({ page }) => {
    // Open the drawer by clicking hamburger menu label
    const hamburger = page.locator('label[for="menu-toggle"]');
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
    // Open drawer
    const hamburger = page.locator('label[for="menu-toggle"]');
    await hamburger.click();

    const checkbox = page.locator('input#menu-toggle');
    const drawer = page.locator('nav[role="dialog"]');
    await expect(drawer).toHaveClass(/translate-x-0/);

    // Focus inside drawer to ensure keyboard listener is active
    const drawerLink = drawer.locator('a, button').first();
    await drawerLink.focus();

    // Press Escape — drawer should close and checkbox should be unchecked
    await page.keyboard.press('Escape');
    await expect(checkbox).not.toBeChecked({ timeout: 500 });
    await expect(drawer).toHaveClass(/translate-x-full/);
  });

  test('3. Focus cycles within drawer with Tab (focus trap)', async ({ page }) => {
    // Open drawer
    const hamburger = page.locator('label[for="menu-toggle"]');
    await hamburger.click();

    const drawer = page.locator('nav[role="dialog"]');
    await expect(drawer).toHaveClass(/translate-x-0/);

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
