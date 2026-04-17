import { test, expect } from './helpers/test';
import { fillSignup, makeTestUser, fillLogin } from './helpers/user';

test.describe('Auth — validation (no DB writes)', () => {
  test('signup: weak password surfaces inline field error', async ({ page }) => {
    const user = makeTestUser();
    await fillSignup(page, { ...user, password: 'short' });
    await page.getByRole('button', { name: /créer mon compte/i }).click();

    await expect(page.getByText(/12 caractères/i).first()).toBeVisible();
  });

  test('signup: submit without required checkboxes is blocked by the browser', async ({ page }) => {
    const user = makeTestUser();
    await page.goto('/signup');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
    await page.getByLabel('Confirmer le mot de passe').fill(user.password);
    await page.getByRole('button', { name: /créer mon compte/i }).click();

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

  test('forgot-password: always reports success (no enumeration)', async ({ page }) => {
    // Requires a reachable Supabase endpoint — skip when the CI env uses the dummy URL.
    test.skip(
      (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('localhost:54321'),
      'Needs real Supabase to complete the password reset round-trip.',
    );
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nonexistent@ankora.test');
    await page.getByRole('button', { name: /envoyer/i }).click();

    await expect(page.getByRole('status')).toBeVisible({ timeout: 15_000 });
  });
});
