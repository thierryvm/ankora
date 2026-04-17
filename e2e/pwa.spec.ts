import { test, expect } from '@playwright/test';

test.describe('PWA', () => {
  test('manifest.webmanifest is served with correct metadata', async ({ page }) => {
    const response = await page.goto('/manifest.webmanifest');
    expect(response?.status()).toBe(200);
    const body = await response?.json();
    expect(body.name).toMatch(/ankora/i);
    expect(body.display).toBe('standalone');
    expect(Array.isArray(body.icons)).toBe(true);
    expect(body.icons.length).toBeGreaterThanOrEqual(1);
  });

  test('offline fallback page is reachable directly', async ({ page }) => {
    const response = await page.goto('/offline');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /hors-ligne/i })).toBeVisible();
  });

  test('icon endpoints respond', async ({ request }) => {
    const svg = await request.get('/icon.svg');
    expect(svg.status()).toBe(200);
    // Next.js App Router serves apple-icon.svg via /apple-icon (file-based route
    // without extension in the output URL).
    const apple = await request.get('/apple-icon');
    expect([200, 308]).toContain(apple.status());
  });
});
