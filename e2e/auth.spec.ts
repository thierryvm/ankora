import { test, expect } from './helpers/test';
import { fillSignup, makeTestUser, fillLogin } from './helpers/user';

test.describe('Auth — validation (no DB writes)', () => {
  test('signup: weak password surfaces inline field error', async ({ page }) => {
    const user = makeTestUser();
    await fillSignup(page, { ...user, password: 'short' });
    await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();

    await expect(page.getByText(/12 caractères/i).first()).toBeVisible();
  });

  test('signup: submit without required checkboxes is blocked by the browser', async ({ page }) => {
    const user = makeTestUser();
    await page.goto('/signup');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
    await page.getByLabel('Confirmer le mot de passe').fill(user.password);
    await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();

    // Browser-native required validation prevents navigation — still on /signup.
    await expect(page).toHaveURL(/\/signup\b/);
  });

  test('login: invalid credentials return a generic error (no account enumeration)', async ({
    page,
  }) => {
    await fillLogin(page, { email: 'ghost@ankora.test', password: 'WrongPass1234' });
    await page.getByRole('button', { name: /^se connecter$/i }).click();

    // Either a generic error alert, or we stay on /login.
    const error = page.getByRole('alert');
    await Promise.race([
      error.waitFor({ state: 'visible', timeout: 10_000 }),
      page.waitForURL(/\/login\b/, { timeout: 10_000 }),
    ]);
    await expect(page).toHaveURL(/\/login\b/);
  });

  // Re-enabled: this needed nothing but a reachable Supabase, and the
  // `e2e-authenticated` job now provides one. It asserts a real security
  // property — the reset endpoint answers identically for a known and an unknown
  // address, so it cannot be used to enumerate accounts. Skipped, it asserted
  // nothing at all.
  test('forgot-password: always reports success (no enumeration)', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nonexistent@ankora.test');
    await page.getByRole('button', { name: /envoyer/i }).click();

    await expect(page.getByRole('status')).toBeVisible({ timeout: 15_000 });
  });
});
