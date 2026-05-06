import { test, expect } from '@playwright/test';

test.describe('THI-122 — 404 page brandée (FR default)', () => {
  test('non-existent path returns 404 with the FR copy', async ({ page }) => {
    const response = await page.goto('/this-page-definitely-does-not-exist-thi122');
    expect(response?.status() ?? 0).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
    await expect(page.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Aller à mon cockpit' })).toBeVisible();
  });

  test('the home CTA navigates back to the landing page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await page.getByRole('link', { name: "Retour à l'accueil" }).click();
    await expect(page).toHaveURL(/\/(?:fr-BE)?\/?$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the 404 page is marked noindex via meta robots', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    // Next.js may emit its own default noindex on 404 alongside ours, so we
    // assert that at least one of the robots metas carries the noindex hint.
    const contents = await page
      .locator('head meta[name="robots"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('content') ?? ''));
    expect(contents.length).toBeGreaterThan(0);
    expect(contents.some((c) => /noindex/i.test(c))).toBe(true);
  });

  test('the cockpit CTA points to /app', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    const cockpitHref = await page
      .getByRole('link', { name: 'Aller à mon cockpit' })
      .getAttribute('href');
    expect(cockpitHref).toBe('/app');
  });
});

test.describe('THI-122 — 404 EN copy (locale cookie)', () => {
  test('renders the EN copy when NEXT_LOCALE=en cookie is set', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'NEXT_LOCALE',
        value: 'en',
        url: page.url() === 'about:blank' ? 'http://localhost:3000' : page.url(),
      },
    ]);
    const response = await page.goto('/this-page-does-not-exist-en');
    expect(response?.status() ?? 0).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
    const cockpitHref = await page
      .getByRole('link', { name: 'Go to my cockpit' })
      .getAttribute('href');
    expect(cockpitHref).toBe('/en/app');
  });
});
