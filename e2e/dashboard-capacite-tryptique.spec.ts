import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * PR-BETA-3 (THI-267) — Capacité d'Épargne Réelle tryptique.
 *
 * Verifies the ADR-009 amendement 2026-05-09 contract end-to-end:
 *   - 3 sub-stats rendered (reste disponible / reste à vivre / capacité)
 *   - "Ajuster ce mois" affordance opens the drawer
 *   - Saving an override updates the card on the next request
 */
test.describe('PR-BETA-3 — Capacité tryptique (ADR-009 amendement)', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test('renders the 3 sub-stats with the @thierry canonical fixture', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 1500, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
      {
        label: 'Assurances',
        amount: 338,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);
    await admin
      .from('workspaces')
      .update({ monthly_income: 2500, vie_courante_monthly_transfer: 500 })
      .eq('id', user.workspaceId);
    // PR-BETA-3 source of truth for the tryptique is workspace_settings.
    await admin
      .from('workspace_settings')
      .update({ reste_a_vivre_default: 500 })
      .eq('workspace_id', user.workspaceId);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      const substats = page.getByTestId('capacite-epargne-substats');
      await expect(substats).toBeVisible();

      const resteDispo = page.getByTestId('substat-reste-disponible');
      await expect(resteDispo).toContainText('Reste disponible');
      await expect(resteDispo).toContainText(/662/);

      const resteAVivre = page.getByTestId('substat-reste-a-vivre');
      await expect(resteAVivre).toContainText('Reste à vivre');
      await expect(resteAVivre).toContainText(/500/);

      const capacite = page.getByTestId('substat-capacite');
      await expect(capacite).toContainText('Capacité épargne');
      await expect(capacite).toContainText(/162/);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('the "Ajuster ce mois" drawer opens and persists a new override', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 1500, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    await admin
      .from('workspaces')
      .update({ monthly_income: 2500, vie_courante_monthly_transfer: 500 })
      .eq('id', user.workspaceId);
    await admin
      .from('workspace_settings')
      .update({ reste_a_vivre_default: 500 })
      .eq('workspace_id', user.workspaceId);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // Open the drawer.
      await page.getByTestId('reste-a-vivre-trigger').first().click();
      await expect(page.getByTestId('reste-a-vivre-drawer')).toBeVisible();

      // Override to 450 and save.
      const input = page.getByTestId('reste-a-vivre-input');
      await input.fill('450');
      await page.getByTestId('reste-a-vivre-save').click();

      // The drawer closes and the sub-stat updates.
      await expect(page.getByTestId('reste-a-vivre-drawer')).toBeHidden();
      await expect(page.getByTestId('substat-reste-a-vivre')).toContainText(/450/);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('renders 3 sub-stats stacked on iPhone viewport (mobile-first)', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 1000, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    await admin
      .from('workspaces')
      .update({ monthly_income: 2500, vie_courante_monthly_transfer: 500 })
      .eq('id', user.workspaceId);
    await admin
      .from('workspace_settings')
      .update({ reste_a_vivre_default: 500 })
      .eq('workspace_id', user.workspaceId);

    await page.setViewportSize({ width: 375, height: 667 });
    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      const resteDispo = page.getByTestId('substat-reste-disponible');
      const resteAVivre = page.getByTestId('substat-reste-a-vivre');
      const capacite = page.getByTestId('substat-capacite');

      await expect(resteDispo).toBeVisible();
      await expect(resteAVivre).toBeVisible();
      await expect(capacite).toBeVisible();

      // Mobile layout: the 3 sub-stats stack vertically (each .top > previous).
      const dispoBox = await resteDispo.boundingBox();
      const aVivreBox = await resteAVivre.boundingBox();
      const capaciteBox = await capacite.boundingBox();
      expect(dispoBox).not.toBeNull();
      expect(aVivreBox).not.toBeNull();
      expect(capaciteBox).not.toBeNull();
      if (dispoBox && aVivreBox && capaciteBox) {
        expect(aVivreBox.y).toBeGreaterThan(dispoBox.y);
        expect(capaciteBox.y).toBeGreaterThan(aVivreBox.y);
      }
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
