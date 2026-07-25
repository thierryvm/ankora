import { test, expect } from '@playwright/test';

/**
 * Guards the regression class the rest of the suite is structurally blind to.
 *
 * Every Playwright project pins `locale: 'fr-BE'` (`playwright.config.ts`), so
 * no existing spec can observe what a non-French browser gets. That blind spot
 * matters: dropping `localeCookie` alone would have promoted `Accept-Language`
 * to sole detector, and since French lives on unprefixed URLs under
 * `localePrefix: 'as-needed'`, an English-browser visitor who picked French
 * would have been 307'd back to `/en` on every unprefixed URL — French
 * unreachable, deterministically, for a whole class of users. `plan-reviewer`
 * caught it before the code was written; this spec is what keeps it caught.
 *
 * Contract asserted: locale comes from the URL prefix and nothing else.
 */
test.use({ locale: 'en-US' });

test.describe('locale detection is off — the URL decides, not the browser', () => {
  test('an English browser still gets French on unprefixed URLs', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('html'), 'the root is French for everyone').toHaveAttribute(
      'lang',
      'fr-BE',
    );
    expect(page.url(), 'no Accept-Language redirect to /en').not.toMatch(/\/en(\/|$)/);

    await page.goto('/faq', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr-BE');
    expect(page.url()).not.toMatch(/\/en(\/|$)/);
  });

  test('an English browser choosing French keeps French — the unreachable-French bug', async ({
    page,
  }) => {
    // Desktop viewport: on mobile the switcher lives inside the nav drawer and
    // is not directly clickable, which is why `locale-switcher.spec.ts` is
    // `testIgnore`d on the mobile projects (cf. playwright.config.ts). The
    // contract under test here — which locale an `en-US` browser resolves to —
    // is viewport-independent, and the two navigation-only tests in this file
    // keep covering it on every project.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    // Go to English first so the switch back to French is a real choice.
    await page.getByTestId('locale-option-en').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.getByTestId('locale-option-fr-BE').click();
    await expect(page.locator('html'), 'French must be reachable').toHaveAttribute('lang', 'fr-BE');
    expect(page.url(), 'must not bounce back to /en').not.toMatch(/\/en(\/|$)/);

    // And it must survive a hard navigation, not just the client transition.
    await page.goto('/faq', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr-BE');
  });

  test('the prefixed URL still serves English to that same browser', async ({ page }) => {
    await page.goto('/en', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
