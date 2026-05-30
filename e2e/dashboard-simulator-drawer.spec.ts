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

  test('selecting a charge reframes the impact on "Reste disponible" (no faux-ami %)', async ({
    page,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      {
        label: 'Abonnement mobile',
        amount: 40,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);
    try {
      // THI-195: réserve libre = revenus − effort lissé. Seed income so the
      // "Reste disponible" framing is shown (not the income-setup hint).
      await admin.from('workspaces').update({ monthly_income: 2466 }).eq('id', user.workspaceId);

      await login(page, user.email, user.password);
      await page.getByTestId('simulator-drawer-trigger').click();
      const drawer = page.getByTestId('simulator-drawer');
      await expect(drawer).toBeVisible();

      // Q3 guided default: no charge pre-selected → empty impact, no rent default.
      await expect(drawer.getByText("Choisis une charge pour voir l'impact.")).toBeVisible();

      // Select the seeded charge (Radix option renders in a portal).
      await drawer.locator('#chargeId').click();
      await page.getByRole('option', { name: /Abonnement mobile/ }).click();

      // Impact is reframed on "Reste disponible" (the cockpit hero metric).
      await expect(page.getByTestId('simulator-reserve')).toBeVisible();
      await expect(drawer.getByText('Reste disponible')).toBeVisible();
      // The "+37,26 % / mois" faux-ami is gone for good.
      await expect(drawer.getByText(/%\s*\/\s*mois/)).toHaveCount(0);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('with no income configured, the impact shows the income-setup hint', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      {
        label: 'Forfait mobile',
        amount: 40,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);
    try {
      // No income seeded → snapshot.monthlyIncome is null → money(0) →
      // incomeMissing: "Reste disponible" can't be framed, show the setup hint.
      await login(page, user.email, user.password);
      await page.getByTestId('simulator-drawer-trigger').click();
      const drawer = page.getByTestId('simulator-drawer');
      await expect(drawer).toBeVisible();
      await drawer.locator('#chargeId').click();
      await page.getByRole('option', { name: /Forfait mobile/ }).click();

      // The income-setup CTA replaces the "Reste disponible" framing.
      await expect(drawer.getByRole('link', { name: /revenus/i })).toBeVisible();
      await expect(page.getByTestId('simulator-reserve')).toHaveCount(0);
      await expect(page.getByTestId('simulator-annual-savings')).toBeVisible();
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
