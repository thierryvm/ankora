import { test, expect } from '@playwright/test';

test.describe('Marketing — smoke', () => {
  test('home page renders CTA and navigation', async ({ page }) => {
    // Force a desktop viewport — MktNav (PR-3c-2) hides the Login + Try-free
    // CTAs below `sm` (640px), exposing them only via the mobile drawer.
    // This smoke test is about the visible-by-default top-nav CTAs, not the
    // drawer (which has its own coverage in landing-sections.spec.ts).
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // CTA labels updated by PR-3c-2 MktNav: "Créer un compte" → "Essayer
    // gratuitement"; "Se connecter" stayed identical.
    await expect(page.getByRole('link', { name: /essayer gratuitement/i }).first()).toBeVisible();
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
