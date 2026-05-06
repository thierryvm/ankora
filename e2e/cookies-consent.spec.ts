import { test, expect, type Page } from '@playwright/test';

const STORAGE_KEY = 'ankora.consent.v1';
const REOPEN_KEY = 'ankora.consent.reopen';

const clearConsentStorage = async (page: Page) => {
  await page.addInitScript(
    ([k1, k2]: [string, string]) => {
      window.localStorage.removeItem(k1);
      window.localStorage.removeItem(k2);
    },
    [STORAGE_KEY, REOPEN_KEY] as [string, string],
  );
};

test.describe('PR-LEGAL-1 — cookies consent flow', () => {
  test('first visit shows the banner with three actions', async ({ page }) => {
    await clearConsentStorage(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Essentiels uniquement' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Personnaliser' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tout accepter' })).toBeVisible();
  });

  test('Accept all dismisses the banner and persists analytics + marketing in localStorage', async ({
    page,
  }) => {
    await clearConsentStorage(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Tout accepter' }).click();
    await expect(page.getByRole('button', { name: 'Tout accepter' })).not.toBeVisible();
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string) as { analytics: boolean; marketing: boolean };
    expect(parsed.analytics).toBe(true);
    expect(parsed.marketing).toBe(true);
  });

  test('Customize → analytics on, marketing off → save persists granular choice', async ({
    page,
  }) => {
    await clearConsentStorage(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Personnaliser' }).click();
    await page.getByRole('checkbox', { name: "Analyse d'usage" }).check();
    await page.getByRole('button', { name: 'Enregistrer mes préférences' }).click();
    await expect(page.getByRole('button', { name: 'Tout accepter' })).not.toBeVisible();
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
    const parsed = JSON.parse(stored as string) as { analytics: boolean; marketing: boolean };
    expect(parsed.analytics).toBe(true);
    expect(parsed.marketing).toBe(false);
  });

  test('Footer "Modifier mes préférences cookies" reopens the banner from any page', async ({
    page,
  }) => {
    // Start with an existing decision so the banner is dismissed initially.
    await page.addInitScript(
      ([k]: [string]) => {
        window.localStorage.setItem(
          k,
          JSON.stringify({
            version: '1.0.0',
            analytics: true,
            marketing: false,
            decidedAt: '2026-01-01T00:00:00.000Z',
          }),
        );
      },
      [STORAGE_KEY] as [string],
    );
    await page.goto('/');
    // Banner not visible because a decision already exists.
    await expect(page.getByRole('button', { name: 'Tout accepter' })).not.toBeVisible();

    // Click the footer reopen button.
    await page.getByRole('button', { name: 'Modifier mes préférences cookies' }).click();
    await expect(page.getByRole('button', { name: 'Tout accepter' })).toBeVisible();
  });
});
