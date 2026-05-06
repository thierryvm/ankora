import { test, expect } from '@playwright/test';

test.describe('THI-122 — 404 page brandée', () => {
  test('navigating to a non-existent path renders the FR-BE 404 page', async ({ page }) => {
    const response = await page.goto('/this-page-definitely-does-not-exist-thi122');
    expect(response?.status() ?? 0).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
    await expect(page.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Aller à mon cockpit' })).toBeVisible();
  });

  test('the 404 home CTA navigates back to the landing page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await page.getByRole('link', { name: "Retour à l'accueil" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the 404 page is marked noindex via meta robots', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    const robots = await page.locator('head meta[name="robots"]').getAttribute('content');
    expect(robots ?? '').toMatch(/noindex/i);
  });
});

test.describe('THI-122 — 404 page (English locale)', () => {
  test('renders the EN 404 copy when /en prefix is used', async ({ page }) => {
    const response = await page.goto('/en/this-page-does-not-exist');
    expect(response?.status() ?? 0).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
  });
});
