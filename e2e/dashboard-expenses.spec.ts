import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

test.describe('Dashboard — monthly expenses section', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test('adding an expense shows it on the dashboard within 3s without manual F5', async ({
    page,
  }) => {
    if (!admin) return;

    // The expenses section only appears once the user has at least one charge
    // (the dashboard otherwise renders the empty-state CTA). Seed one charge
    // so we land on the populated dashboard.
    const user = await seedOnboardedUser(admin, [
      {
        label: 'Loyer',
        amount: 600,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // Dashboard starts with the expenses section in empty state.
      await expect(page.getByRole('heading', { name: /dépenses\s+—/i })).toBeVisible();
      await expect(page.getByText(/aucune dépense enregistrée pour ce mois/i)).toBeVisible();

      // Navigate to /app/expenses via the in-dashboard CTA button (client-side nav).
      await page.getByRole('link', { name: /^mes dépenses$/i }).click();
      await page.waitForURL(/\/app\/expenses\b/, { timeout: 5_000 });
      await expect(page.getByRole('heading', { name: /mes dépenses/i })).toBeVisible();

      // Add an expense via the form.
      await page.locator('#label').fill('Test PR-C2a');
      await page.locator('#amount').fill('5');
      await page.getByRole('button', { name: /^ajouter$/i }).click();
      await expect(page.getByText(/dépense ajoutée/i)).toBeVisible({ timeout: 5_000 });

      // Navigate back to the dashboard via the Header link (client-side nav).
      // This exercises the Router Cache invalidation locked by PR #88.
      const startedAt = Date.now();
      await page.getByRole('link', { name: /tableau de bord/i }).click();
      await page.waitForURL(/\/app(\?|$|\/?$)/, { timeout: 5_000 });

      // The new expense must appear in the section, the empty-state copy must be gone,
      // the count must reflect the new value, and the total must show 5,00 €.
      // All within the 3-second budget.
      await expect(page.getByText(/aucune dépense enregistrée pour ce mois/i)).not.toBeVisible({
        timeout: 3_000,
      });
      await expect(page.getByText(/test pr-c2a/i)).toBeVisible({ timeout: 3_000 });
      await expect(page.getByText(/1 dépense ce mois/i)).toBeVisible({ timeout: 3_000 });
      // Total appears in the section header — looking for the formatted euro amount.
      await expect(page.getByText(/5,00\s*€/).first()).toBeVisible({ timeout: 3_000 });

      const elapsed = Date.now() - startedAt;
      expect(elapsed).toBeLessThan(3_000);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
