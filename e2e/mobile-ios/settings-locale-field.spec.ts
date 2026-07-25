import { expect } from '@playwright/test';

import { test } from './fixtures/mobile-test';

/**
 * Settings › Profile — the language field.
 *
 * The control it replaced was broken twice over: it offered `fr-FR` and
 * `en-GB`, neither of which exists in `LOCALES`, so every choice but `fr-BE`
 * failed server validation with a generic toast; and `updateProfileAction`
 * wrote `users.locale` without touching the NEXT_LOCALE cookie or revalidating,
 * so even an accepted `fr-BE` changed nothing on screen — the rendered locale
 * comes from the URL prefix alone. Two divergent writers for one preference.
 *
 * ⚠️ This spec is `seededUser`-gated and AUTO-SKIPS in CI (no
 * `SUPABASE_SERVICE_ROLE_KEY` there — one Supabase project, the service_role
 * key must not reach CI). A green pipeline does NOT mean these assertions ran.
 * Run locally: load `.env.local` into the environment, start a server, then
 * `E2E_BASE_URL=<url> npx playwright test e2e/mobile-ios/settings-locale-field.spec.ts`.
 */
test.describe('Settings — language field', () => {
  test.beforeEach(async ({ page, seededUser }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 30_000 });
    await page.goto('/app/settings', { waitUntil: 'networkidle' });
  });

  test('offers exactly FR and EN, and nothing else', async ({ page }) => {
    // Locators MUST be scoped through the wrapper: `Header variant="app"` also
    // renders a LocaleSwitcher (its `hidden lg:flex` block is in the DOM at
    // every viewport), so the switcher's own testids are ambiguous here.
    const field = page.getByTestId('settings-locale-field');
    await expect(field).toBeVisible();

    await expect(field.getByRole('radio')).toHaveCount(2);
    expect((await field.getByRole('radio').allTextContents()).map((t) => t.trim())).toEqual([
      'FR',
      'EN',
    ]);

    // The old <Select> — with its fr-FR / en-GB options the server rejected —
    // must be gone, not merely hidden.
    await expect(page.getByRole('combobox')).toHaveCount(0);
  });

  test('names the group after its visible label, not the header switcher', async ({ page }) => {
    // Two radiogroups are focusable on this page at ≥1024px. Sharing the
    // accessible name "Changer de langue" would make them indistinguishable in
    // a screen reader's element list, so this one is named by its visible
    // "Langue" text — which also makes accessible name and visible label match
    // exactly (WCAG 2.5.3) rather than merely overlap.
    const field = page.getByTestId('settings-locale-field');
    await expect(field.getByRole('radiogroup')).toHaveAccessibleName('Langue');
  });

  test('is not part of the profile form — saving the name leaves the language alone', async ({
    page,
  }) => {
    // The switcher persists immediately and navigates; the name is a draft
    // submitted with a button. Keeping them in one form implied "Save" applied
    // to both, and made an unsaved name vanish on a language switch.
    const field = page.getByTestId('settings-locale-field');
    await expect(field.getByRole('radio', { name: /français/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.getByLabel(/nom d'affichage/i).fill('Thierry QA');
    await page.getByRole('button', { name: /^enregistrer$/i }).click();

    // Still French, still on the unprefixed URL: submitting the profile form
    // must not touch the language.
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr-BE');
    expect(page.url()).not.toMatch(/\/en(\/|$)/);
    await expect(field.getByRole('radio', { name: /français/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
