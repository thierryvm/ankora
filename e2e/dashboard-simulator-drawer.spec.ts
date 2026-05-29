import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * THI-195 — What-if simulator drawer.
 *
 * The simulator is now reachable in-page from the dashboard "Simuler" CTA
 * (drawer), while the standalone /app/simulator route is preserved.
 *
 * Verifies end-to-end:
 *   - the CTA opens the drawer (no navigation), with the calculator mounted
 *   - ESC / backdrop / X all close it
 *   - focus returns to the trigger after closing (WCAG 2.4.3)
 *   - /app/simulator still renders its full header (hideHeader default = false)
 */
test.describe('THI-195 — simulator drawer', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  async function login(page: import('@playwright/test').Page, email: string, password: string) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 15_000 });
  }

  test('the "Simuler" CTA opens the drawer in-page with the calculator mounted', async ({
    page,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      {
        label: 'Assurance auto',
        amount: 120,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);
    try {
      await login(page, user.email, user.password);

      const trigger = page.getByTestId('simulator-drawer-trigger');
      await expect(trigger).toBeVisible();
      await trigger.click();

      const drawer = page.getByTestId('simulator-drawer');
      await expect(drawer).toBeVisible();
      // URL must NOT have navigated — the drawer is in-page.
      await expect(page).toHaveURL(/\/app\b(?!\/simulator)/);
      // The calculator mounted: the three mode pills come from SimulatorClient.
      await expect(page.getByRole('button', { name: 'Annuler une charge' })).toBeVisible();
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('ESC, backdrop and X each close the drawer', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 1000, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    try {
      await login(page, user.email, user.password);
      const trigger = page.getByTestId('simulator-drawer-trigger');
      const drawer = page.getByTestId('simulator-drawer');

      // ESC
      await trigger.click();
      await expect(drawer).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();

      // Backdrop
      await trigger.click();
      await expect(drawer).toBeVisible();
      await page.getByTestId('simulator-drawer-backdrop').click({ position: { x: 5, y: 5 } });
      await expect(drawer).toBeHidden();

      // X button
      await trigger.click();
      await expect(drawer).toBeVisible();
      await page.getByTestId('simulator-drawer-close').click();
      await expect(drawer).toBeHidden();
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('focus returns to the trigger after closing with ESC', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin);
    try {
      await login(page, user.email, user.password);
      const trigger = page.getByTestId('simulator-drawer-trigger');
      await trigger.click();
      await expect(page.getByTestId('simulator-drawer')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('simulator-drawer')).toBeHidden();
      await expect(trigger).toBeFocused();
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('the /app/simulator route fallback still renders its full header', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin);
    try {
      await login(page, user.email, user.password);
      await page.goto('/app/simulator');
      // hideHeader defaults to false on the standalone route → the page <h1>
      // is present (the drawer suppresses it; the route must not regress).
      await expect(page.getByRole('heading', { level: 1, name: 'Simulateur' })).toBeVisible();
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
