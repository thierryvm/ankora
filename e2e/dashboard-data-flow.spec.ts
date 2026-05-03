import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

test.describe('Dashboard data flow — revalidatePath with [locale] segment', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test('adding a charge updates the dashboard within 3s without manual F5', async ({ page }) => {
    if (!admin) return;

    // Seed an onboarded user with NO charges so the dashboard renders the empty state.
    const user = await seedOnboardedUser(admin, []);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // Confirm the dashboard starts in the empty state.
      await expect(
        page.getByRole('heading', { name: /commence par ajouter tes charges/i }),
      ).toBeVisible();

      // Navigate to charges via the in-app Header link (client-side nav, exercises Router Cache).
      await page.getByRole('link', { name: /^charges$/i }).click();
      await page.waitForURL(/\/app\/charges\b/, { timeout: 5_000 });
      await expect(page.getByRole('heading', { name: /mes charges/i })).toBeVisible();

      // Fill and submit the create-charge form.
      await page.getByLabel(/intitulé|libellé|label/i).fill('Netflix');
      await page.getByLabel(/montant/i).fill('12.99');
      await page.getByRole('button', { name: /^ajouter$/i }).click();
      await expect(page.getByText(/charge ajoutée/i)).toBeVisible({ timeout: 5_000 });

      // Navigate back to the dashboard via Header link (client-side nav).
      // This is the exact scenario where the Router Cache bug used to keep the empty state.
      const startedAt = Date.now();
      await page.getByRole('link', { name: /tableau de bord/i }).click();
      await page.waitForURL(/\/app(\?|$|\/?$)/, { timeout: 5_000 });

      // Empty state must be gone, KPI cards must be visible — within the 3-second budget.
      await expect(
        page.getByRole('heading', { name: /commence par ajouter tes charges/i }),
      ).not.toBeVisible({ timeout: 3_000 });
      await expect(page.getByText(/provisions \/ mois/i).first()).toBeVisible({ timeout: 3_000 });

      const elapsed = Date.now() - startedAt;
      expect(elapsed).toBeLessThan(3_000);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
