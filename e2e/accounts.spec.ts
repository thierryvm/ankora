import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';
import { ouvrirRepli } from './helpers/cockpit';

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
      // ATTENDUS MODIFIÉS PAR LE LOT B, et pourquoi. La section « Plan du mois »
      // n'existe plus : ses trois lignes vivent dans le repli « Virements du
      // mois », fermé au chargement (`Repli.tsx`). Deux conséquences, toutes
      // deux assumées ici :
      //  1. il faut OUVRIR le repli — un corps `hidden` a une boîte de 0 × 0, et
      //     mesurer dedans rendrait une fausse certitude ;
      //  2. deux libellés ont changé de mots avec le vocabulaire v3 (décision
      //     @thierry du 19 septembre) : « Principal → Vie Courante » est devenu
      //     « Virement à faire vers Dépenses du quotidien », et « À virer vers
      //     l'épargne » « Virement à faire vers Provisions pour tes factures ».
      // Aucune assertion n'est retirée ni élargie : ce sont les mêmes trois
      // lignes et les mêmes deux montants, aux mots que la page affiche
      // vraiment (`messages/fr-BE.json`, `cockpit.virements.*`).
      await ouvrirRepli(page, 'repli-virements');
      await expect(page.getByText(/virement à faire vers dépenses du quotidien/i)).toBeVisible();
      // The épargne line is BIDIRECTIONAL — « Virement à faire vers Provisions
      // pour tes factures » or « À reprendre sur Provisions pour tes factures »
      // depending on sign. Here the direction is deterministic by construction:
      // the quarterly charge is seeded on `nextMonth`, so nothing is withdrawn in
      // the current one. Asserting the exact direction is therefore legitimate,
      // and it keeps the check a wildcard would have lost.
      await expect(
        page.getByText(/virement à faire vers provisions pour tes factures/i),
      ).toBeVisible();
      await expect(page.getByText(/après tes sorties/i)).toBeVisible();

      const planCard = page.getByTestId('repli-virements');
      // Round euros render WITHOUT decimals since 2026-06-02: formatters.ts sets
      // `trailingZeroDisplay: 'stripIfInteger'` and formatters.test.ts:47 asserts
      // « 500 € ». This spec still expected « 500,00 » and could never match —
      // the 2026-08-25 run already died on this line, after the two label fixes
      // above, and the red was misread as a stale branch. Anchored so the hint
      // sentences (« provision 30 € … ») cannot stand in for the headline amount;
      // `\s` covers the no-break space Intl puts before the euro sign.
      await expect(planCard.getByText(/^500\s€$/).first()).toBeVisible();
      await expect(planCard.getByText(/^30\s€$/).first()).toBeVisible();
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
