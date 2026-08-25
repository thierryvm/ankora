import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();
const nextMonth = ((new Date().getMonth() + 1) % 12) + 1;

test.describe('Accounts — 3-comptes saisie + Plan du mois', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test('user fills balances and dashboard shows the correct ventilation', async ({ page }) => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin, [
      {
        label: 'Netflix',
        amount: 100,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
      {
        label: 'Assurance auto',
        amount: 90,
        frequency: 'quarterly',
        dueMonth: nextMonth,
        paidFrom: 'epargne',
      },
    ]);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      await page.goto('/app/accounts');
      await expect(page.getByRole('heading', { name: /mes comptes/i })).toBeVisible();

      await page.locator('#monthly-income').fill('2500');
      await page
        .getByRole('button', { name: /^enregistrer$/i })
        .first()
        .click();
      await expect(page.getByText(/revenu mensuel mis à jour/i)).toBeVisible();

      await page.locator('#vie-transfer').fill('500');
      await page
        .getByRole('button', { name: /^enregistrer$/i })
        .nth(1)
        .click();
      await expect(page.getByText(/virement mensuel mis à jour/i)).toBeVisible();

      await page.locator('#balance-principal').fill('1000');
      await page.locator('#balance-principal').locator('..').getByRole('button').click();
      await expect(page.getByText(/compte principal mis à jour/i)).toBeVisible();

      await page.locator('#balance-vie_courante').fill('300');
      await page.locator('#balance-vie_courante').locator('..').getByRole('button').click();
      await expect(page.getByText(/vie courante mis à jour/i)).toBeVisible();

      await page.locator('#balance-epargne').fill('400');
      await page.locator('#balance-epargne').locator('..').getByRole('button').click();
      await expect(page.getByText(/épargne.+mis à jour/i)).toBeVisible();

      await page.goto('/app');
      await expect(page.getByRole('heading', { name: /plan du mois/i })).toBeVisible();
      await expect(page.getByText(/principal → vie courante/i)).toBeVisible();
      // Two labels were RENAMED and this spec still named the old ones — measured
      // 2026-08-25 on its first execution since 2026-07-26. Not a weakened
      // assertion: it proves the same two lines are on the card, at the words the
      // card actually shows (`messages/fr-BE.json:684,687`).
      //
      // The épargne line is BIDIRECTIONAL — `transferPrincipalToEpargne` (« À virer
      // vers l'épargne ») or `transferEpargneToPrincipal` (« À reprendre sur
      // l'épargne ») depending on sign. Here the direction is deterministic by
      // construction: the quarterly charge is seeded on `nextMonth`, so nothing is
      // withdrawn in the current one. Asserting the exact direction is therefore
      // legitimate, and it keeps the check a wildcard would have lost.
      //
      // The apostrophe is TYPOGRAPHIC (U+2019) in the messages file; a straight `'`
      // matches nothing. Same trap class as a missing accent in a French selector.
      await expect(page.getByText(/à virer vers l['’]épargne/i)).toBeVisible();
      await expect(page.getByText(/après tes sorties/i)).toBeVisible();

      const planCard = page
        .getByRole('heading', { name: /plan du mois/i })
        .locator('xpath=ancestor::section');
      await expect(planCard.getByText(/500,00|500\.00/).first()).toBeVisible();
      await expect(planCard.getByText(/30,00|30\.00/).first()).toBeVisible();
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
