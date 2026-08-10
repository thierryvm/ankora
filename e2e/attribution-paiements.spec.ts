import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * ADR-038 D3 (livraison J1) — un paiement enregistre LE COMPTE QUI A PAYÉ, au
 * moment où il a payé.
 *
 * ## Pourquoi ces preuves vivent ici et pas dans Vitest
 *
 * Trois des quatre cas ci-dessous vérifient des garanties de BASE DE DONNÉES :
 * un trigger, une clé étrangère composite, l'absence de propagation d'un
 * UPDATE. Les tests d'action du dépôt travaillent sur un faux client Supabase
 * (`src/lib/actions/__tests__/charge-payments.test.ts` vérifie
 * `table: 'charge_payments'`, pas la base) : ils ne peuvent, par construction,
 * rien dire d'un trigger. Le seul instrument du dépôt qui touche une vraie base
 * est `adminClientOrNull()`, donc le job Playwright authentifié.
 *
 * Le quatrième cas, lui, passe par l'INTERFACE, et c'est le plus utile des
 * quatre : le geste groupé de `src/lib/actions/obligations.ts` n'a AUCUN test
 * Vitest — ni le fichier d'action, ni son insertion par lot. Sans ce cas, un
 * `paid_from_account_type` oublié dans l'un des deux inserts par lot ne se
 * verrait qu'à la migration `contract`, sous la forme d'un 23502 en production.
 *
 * Ce que ces cas NE prouvent PAS, et il ne faut pas le leur faire dire :
 * l'attribution n'est pas immuable. Dépointer supprime physiquement la ligne
 * (issue #361), donc décocher puis recocher ré-attribue librement. Le trigger
 * protège contre un `update` oublié dans une future Server Action, rien de plus.
 */
test.describe('ADR-038 D3 — le compte qui paie se fige sur le paiement', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  /** Une facture réglée depuis l'ÉPARGNE — jamais la valeur par défaut. */
  const factureEpargne = {
    label: 'Taxe communale',
    amount: 120,
    frequency: 'monthly' as const,
    dueMonth: 1,
    paidFrom: 'epargne' as const,
  };

  /**
   * Sa jumelle sur le compte principal. Les DEUX sont nécessaires : avec la
   * seule facture épargne, une attribution codée en dur à `provisions` dans
   * `obligations.ts` passerait le test sans que rien ne le dise.
   */
  const facturePrincipal = {
    label: 'Loyer',
    amount: 800,
    frequency: 'monthly' as const,
    dueMonth: 1,
    paidFrom: 'principal' as const,
  };

  test('le geste groupé attribue chaque obligation à SON compte, factures et échéances', async ({
    page,
  }) => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin, [factureEpargne, facturePrincipal]);
    const maintenant = new Date();
    const annee = maintenant.getFullYear();
    const mois = maintenant.getMonth() + 1;

    try {
      // Un engagement réglé depuis l'épargne lui aussi, échu ce mois-ci : le
      // geste groupé écrit dans les DEUX tables, en deux inserts par lot
      // distincts (`obligations.ts`), et c'est la seule couverture qu'ils aient.
      // `payment_day: 1` rend l'échéance passée quel que soit le jour du mois —
      // `echeancesPassees` compare `dueDateIso <= todayIso`, aujourd'hui inclus.
      const { error: engagementError } = await admin.from('commitments').insert({
        workspace_id: user.workspaceId,
        created_by: user.userId,
        label: 'Prêt travaux',
        kind: 'debt',
        total_amount: 1200,
        installment_amount: 100,
        installments_total: 12,
        start_year: annee,
        start_month: mois,
        payment_day: 1,
        frequency: 'monthly',
        paid_from: 'epargne',
      });
      expect(engagementError, 'seed engagement').toBeNull();

      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      await page.goto('/fr-BE/app/charges');
      const geste = page.getByTestId('charges-bulk-past-due');
      await expect(geste).toBeVisible();
      await expect(geste).toHaveAttribute('data-gesture', 'pointer');
      await geste.click();

      const attributions = async () => {
        const [factures, echeances] = await Promise.all([
          admin
            .from('charge_payments')
            .select('paid_from_account_type')
            .eq('workspace_id', user.workspaceId),
          admin
            .from('commitment_payments')
            .select('paid_from_account_type')
            .eq('workspace_id', user.workspaceId),
        ]);
        return {
          // Trié : l'ordre d'insertion d'un lot n'est pas un contrat.
          factures: (factures.data ?? []).map((r) => r.paid_from_account_type).sort(),
          echeances: (echeances.data ?? []).map((r) => r.paid_from_account_type).sort(),
        };
      };

      // Les deux valeurs, dans le même lot : c'est ce qui distingue « l'action
      // lit chaque ligne parente » de « l'action écrit une constante ». Aucune
      // troncature possible non plus — l'égalité porte sur le tableau entier.
      await expect
        .poll(attributions, {
          timeout: 15_000,
          message: 'le geste groupé n’a pas attribué chaque obligation à son compte',
        })
        .toEqual({
          factures: ['income_bills', 'provisions'],
          echeances: ['provisions'],
        });
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('un UPDATE direct de l’attribution est refusé', async () => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin, [factureEpargne]);
    try {
      const paiementId = await inserePaiement(user.workspaceId, user.userId, 'provisions');

      const { error } = await admin
        .from('charge_payments')
        .update({ paid_from_account_type: 'income_bills' })
        .eq('id', paiementId);

      expect(error, 'le trigger de gel aurait dû refuser').not.toBeNull();

      // Et la ligne n'a pas bougé : un refus qui laisse passer la valeur ne
      // serait pas un refus.
      const { data } = await admin
        .from('charge_payments')
        .select('paid_from_account_type')
        .eq('id', paiementId)
        .single();
      expect(data?.paid_from_account_type).toBe('provisions');
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('changer « payé depuis » sur la facture ne touche aucun paiement déjà enregistré', async () => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin, [factureEpargne]);
    try {
      const paiementId = await inserePaiement(user.workspaceId, user.userId, 'provisions');

      const { error } = await admin
        .from('charges')
        .update({ paid_from: 'principal' })
        .eq('workspace_id', user.workspaceId);
      expect(error, 'la charge doit rester modifiable').toBeNull();

      const { data } = await admin
        .from('charge_payments')
        .select('paid_from_account_type')
        .eq('id', paiementId)
        .single();
      // C'est TOUTE la raison d'être de D3 : `charges.paid_from` est mutable,
      // donc un solde dérivé d'elle serait réécrit rétroactivement, en silence.
      expect(data?.paid_from_account_type).toBe('provisions');
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('un compte qui n’existe pas pour ce workspace est refusé par la clé étrangère', async () => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin, [factureEpargne]);
    try {
      const { data: charge } = await admin
        .from('charges')
        .select('id')
        .eq('workspace_id', user.workspaceId)
        .single();

      const { error } = await admin.from('charge_payments').insert({
        charge_id: charge!.id,
        workspace_id: user.workspaceId,
        period_year: 2026,
        period_month: 3,
        paid_amount: 120,
        created_by: user.userId,
        paid_from_account_type: 'compte_imaginaire',
      });

      expect(error, 'la clé étrangère aurait dû refuser').not.toBeNull();
      expect(error?.code, 'violation de clé étrangère attendue').toBe('23503');
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  /** Écrit un paiement directement, pour les cas qui n'ont pas besoin de l'UI. */
  async function inserePaiement(
    workspaceId: string,
    userId: string,
    attribution: string,
  ): Promise<string> {
    const { data: charge } = await admin!
      .from('charges')
      .select('id')
      .eq('workspace_id', workspaceId)
      .single();

    const { data, error } = await admin!
      .from('charge_payments')
      .insert({
        charge_id: charge!.id,
        workspace_id: workspaceId,
        period_year: 2026,
        period_month: 2,
        paid_amount: 120,
        created_by: userId,
        paid_from_account_type: attribution,
      })
      .select('id')
      .single();

    expect(error, 'seed paiement').toBeNull();
    return data!.id;
  }
});
