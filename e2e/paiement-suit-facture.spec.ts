import { test, expect, type Page } from '@playwright/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * Tour 76 — a bill ticked as paid, then corrected: this month's payment follows
 * the new amount, the confirmation SAYS so, and « Mes comptes » moves by
 * exactly the difference. All figures are fictitious.
 *
 * Why an end-to-end spec: the unit tests stub the action, and the action tests
 * stub the database. Only this one proves that the sentence on screen, the row
 * in `charge_payments` and the account balance tell the same story.
 */
const ANCIEN = 505;
const NOUVEAU = 705;
const RELEVE = 1000;

/** « 1 295,00 € » → 1295 ; handles the no-break spaces and the minus sign. */
function enNombre(texte: string): number {
  return Number(
    texte
      .replace(/[−]/g, '-')
      .replace(/[^\d,-]/g, '')
      .replace(',', '.'),
  );
}

/**
 * The gap line of « Mes comptes » (« Écart avec tes opérations · -495 € »): the
 * balance read minus the balance expected from the operations. The read balance
 * does not move, so the gap moves by exactly what the operations moved.
 */
async function ecartDe(page: Page, compte: string): Promise<number> {
  await page.goto('/fr-BE/app/accounts');
  const ligne = page.getByTestId(`ecart-${compte}`);
  await expect(ligne).toBeVisible();
  return enNombre((await ligne.innerText()).split('·').pop() ?? '');
}

// The sign-in limiter is keyed by address (5 per 15 min). A spec that signs in
// once per project must not eat the allowance of the ones that follow, so it
// presents its own private address (documentation range, never a real one).
test.use({
  extraHTTPHeaders: { 'x-forwarded-for': `203.0.113.${1 + Math.floor(Math.random() * 250)}` },
});

test.describe('le paiement suit la facture corrigée', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test('la phrase du toast le dit, la base le confirme, le solde bouge de l’écart exact', async ({
    page,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      {
        label: 'Assurance habitation',
        amount: ANCIEN,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);
    try {
      // Onboarding writes a starting balance of 0 dated today. A statement of
      // 1 000 € dated BEFORE the month gives the operations something to
      // debit: the card then reads 0 against 1 000 − the bill expected.
      const debut = new Date();
      debut.setDate(1);
      debut.setMonth(debut.getMonth() - 1);
      const { error: releveError } = await admin.from('account_balance_statements').insert({
        workspace_id: user.workspaceId,
        created_by: user.userId,
        account_type: 'income_bills',
        balance: RELEVE,
        stated_on: debut.toISOString().slice(0, 10),
      });
      expect(releveError, 'seed relevé').toBeNull();

      const { data: charge } = await admin
        .from('charges')
        .select('id')
        .eq('workspace_id', user.workspaceId)
        .single();
      const chargeId = charge!.id;

      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });
      // Let the post-sign-in redirect finish: a goto issued during it is
      // interrupted by it (seen on mobile-safari).
      await page.waitForLoadState('networkidle');

      // 1. Tick the bill: the sheet « Marquer payée », confirmed as is.
      await page.goto('/fr-BE/app/charges');
      await page.getByTestId(`charges-row-paid-${chargeId}`).click();
      await page.getByTestId('charge-pay-submit').click();
      await expect(page.getByText('Facture marquée payée').first()).toBeVisible();
      await expect
        .poll(async () => {
          const { data } = await admin
            .from('charge_payments')
            .select('paid_amount')
            .eq('charge_id', chargeId);
          return (data ?? []).map((r) => Number(r.paid_amount));
        })
        .toEqual([ANCIEN]);

      const avant = await ecartDe(page, 'income_bills');
      expect(avant, 'la facture payée à son ancien montant').toBe(-(RELEVE - ANCIEN));

      // 2. Correct the amount in the drawer, key by key.
      await page.goto('/fr-BE/app/charges');
      await page.locator(`[data-testid="charges-row-open-${chargeId}"]`).click();
      const champ = page.getByTestId('charge-edit-amount');
      await champ.click();
      await champ.press('ControlOrMeta+A');
      await champ.pressSequentially(String(NOUVEAU));
      await expect(champ).toHaveValue(String(NOUVEAU));
      await page.getByTestId('charge-edit-save').click();

      const mois = new Intl.DateTimeFormat('fr-BE', {
        month: 'long',
        timeZone: 'Europe/Brussels',
      }).format(new Date());
      await expect(
        page.getByText(new RegExp(`^Le paiement pour ${mois} passe de 505[^à]*à 705`, 'u')).first(),
      ).toBeVisible();

      // 3. The row in the base followed: one payment, at the new amount.
      const { data: paiements } = await admin
        .from('charge_payments')
        .select('paid_amount')
        .eq('charge_id', chargeId);
      expect((paiements ?? []).map((r) => Number(r.paid_amount))).toEqual([NOUVEAU]);

      // 4. The account moved by exactly the difference: the gap line went from
      // -495 to -295 (read 0 minus the expected 1 000 − bill).
      const apres = await ecartDe(page, 'income_bills');
      expect(apres - avant, 'écart exact entre les deux soldes').toBe(NOUVEAU - ANCIEN);
      expect(apres).toBe(-(RELEVE - NOUVEAU));
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
