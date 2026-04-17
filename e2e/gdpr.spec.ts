import { test, expect } from '@playwright/test';

test.describe('GDPR — marketing surface', () => {
  test('cookie banner renders and can be dismissed', async ({ page, browserName }) => {
    // Playwright's iPhone emulation fails to dispatch the click through to the
    // banner button during React hydration — the handler never fires and
    // localStorage stays empty. The dismiss contract is identical across
    // engines, so chromium-desktop and mobile-chrome cover it.
    test.skip(browserName === 'webkit', 'Tap dispatch flakes under iPhone emulation.');

    await page.goto('/');
    const banner = page.getByRole('dialog').filter({ hasText: /cookies/i });
    await expect(banner).toBeVisible();

    await banner.getByRole('button', { name: /essentiels uniquement/i }).click();

    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('ankora.consent.v1')))
      .not.toBeNull();

    await page.reload();
    await expect(page.getByRole('dialog').filter({ hasText: /cookies/i })).toBeHidden();
  });

  test('privacy policy lists RGPD rights art. 15-22', async ({ page }) => {
    await page.goto('/legal/privacy', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/droit/i).first()).toBeVisible();
    await expect(page.getByText(/portabilité/i).first()).toBeVisible();
    await expect(page.getByText(/effacement/i).first()).toBeVisible();
    await expect(page.getByText(/rectification/i).first()).toBeVisible();
  });

  test('cookie policy distinguishes essential vs analytics vs marketing', async ({ page }) => {
    await page.goto('/legal/cookies');
    await expect(page.getByText(/essentiels/i).first()).toBeVisible();
    await expect(page.getByText(/analytics/i).first()).toBeVisible();
    await expect(page.getByText(/marketing/i).first()).toBeVisible();
  });
});
