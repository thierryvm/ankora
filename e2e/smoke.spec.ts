import { test, expect } from '@playwright/test';

test.describe('Marketing — smoke', () => {
  test('home page renders CTA and navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /créer un compte/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /se connecter/i }).first()).toBeVisible();
  });

  test('faq page exposes questions', async ({ page }) => {
    await page.goto('/faq');
    await expect(page.getByRole('heading', { name: /questions fréquentes/i })).toBeVisible();
    await expect(page.getByText(/se connecte à ma banque/i)).toBeVisible();
  });

  test('legal pages are reachable and readable', async ({ page }) => {
    for (const path of ['/legal/cgu', '/legal/privacy', '/legal/cookies']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

test.describe('Auth — unauthenticated guards', () => {
  test('visiting /app redirects to /login', async ({ page }) => {
    const response = await page.goto('/app');
    expect(page.url()).toContain('/login');
    expect(response?.status() ?? 0).toBeLessThan(500);
  });

  test('visiting /app/settings redirects to /login', async ({ page }) => {
    await page.goto('/app/settings');
    expect(page.url()).toContain('/login');
  });

  test('visiting /onboarding redirects to /login', async ({ page }) => {
    await page.goto('/onboarding');
    expect(page.url()).toContain('/login');
  });
});
