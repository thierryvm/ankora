/**
 * Tour 42 (ADR-046) — the month an « argent reçu » counts for, on a real local
 * stack, at 375 px.
 *
 * What this spec proves, and nothing else:
 * - the first « mon revenu du mois » is proposed for the month of its date,
 *   with no warning, and the base keeps no assignment;
 * - the second one, that month being served, is proposed for the NEXT month:
 *   the sheet says so before saving, the base stores that month, and the line
 *   on Mes comptes reads « · pour <mois suivant> ».
 *
 * Dates are relative to today (a date after today is refused), so the spec
 * holds on any day. Fictitious figures only (the 505 / 705 family).
 */
import type { Page } from '@playwright/test';

import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();
type SeededUser = Awaited<ReturnType<typeof seedOnboardedUser>>;
const ECRITURE_MS = 15_000;

test.use({ viewport: { width: 375, height: 812 } });

/** Today's month and the next one, in Europe/Brussels, as the app reads them. */
function moisDuJourEtSuivant() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
  const [y, m] = iso.split('-').map(Number) as [number, number];
  const suivant = m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
  const nom = (month: number) =>
    new Intl.DateTimeFormat('fr-BE', { month: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(2000, month - 1, 1)))
      .toLowerCase();
  return {
    courant: { year: y, month: m },
    suivant,
    nomSuivant: suivant.year === y ? nom(suivant.month) : `${nom(suivant.month)} ${suivant.year}`,
  };
}

async function seConnecter(page: Page, user: SeededUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL(/\/app\b/, { timeout: 20_000 });
}

async function ouvrirFeuilleArgentRecu(page: Page) {
  const feuille = page.getByTestId('feuille-argent-recu');
  await expect(async () => {
    await page.getByRole('button', { name: 'Argent reçu', exact: true }).click();
    await expect(feuille).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return feuille;
}

test.describe.serial('Le mois concerné d’un argent reçu', () => {
  test.skip(!admin, 'Needs a local Supabase (E2E_SUPABASE_READY=1).');

  let a: SeededUser | null = null;

  test.beforeAll(async () => {
    if (!admin) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    if (!url.includes('127.0.0.1')) {
      throw new Error(
        `Refus: cette spec ÉCRIT des opérations et NEXT_PUBLIC_SUPABASE_URL=${url} ` +
          "n'est pas une pile locale. Elle ne tourne que contre 127.0.0.1.",
      );
    }
    a = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 505, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    const { error } = await admin
      .from('workspaces')
      .update({ monthly_income: 2505, vie_courante_monthly_transfer: 505 })
      .eq('id', a.workspaceId);
    if (error) throw new Error(`semis revenu: ${error.message}`);
  });

  test.afterAll(async () => {
    if (admin && a) await deleteSeededUser(admin, a.userId);
  });

  test('le premier revenu reste à son mois ; le second est proposé pour le mois suivant, et le dit', async ({
    page,
  }) => {
    if (!admin || !a) return;
    test.setTimeout(120_000);
    const { suivant, nomSuivant } = moisDuJourEtSuivant();
    await seConnecter(page, a);
    await page.goto('/app/accounts');

    // 1. First « mon revenu du mois »: nothing served yet → the month of its date.
    let feuille = await ouvrirFeuilleArgentRecu(page);
    let montant = feuille.getByLabel('Combien as-tu reçu ?');
    await montant.click();
    await montant.pressSequentially('705');
    await expect(montant).toHaveValue('705');
    await expect(feuille.getByTestId('mois-concerne-avertissement')).toHaveCount(0);
    await feuille.getByRole('button', { name: /^enregistrer$/i }).click();
    await expect(page.getByText('Argent reçu enregistré').first()).toBeVisible({
      timeout: ECRITURE_MS,
    });
    await expect(feuille).toBeHidden();

    // 2. Second one: this month is served → proposed for the next, said BEFORE saving.
    await page.reload();
    feuille = await ouvrirFeuilleArgentRecu(page);
    montant = feuille.getByLabel('Combien as-tu reçu ?');
    await montant.click();
    await montant.pressSequentially('505');
    await expect(montant).toHaveValue('505');
    const avertissement = feuille.getByTestId('mois-concerne-avertissement');
    await expect(avertissement).toBeVisible();
    await expect(avertissement).toContainText(
      `Salaire du mois suivant : il comptera pour ${nomSuivant}.`,
    );
    await expect(feuille.getByRole('radio', { name: `Pour ${nomSuivant}` })).toBeChecked();
    const description = feuille.getByLabel('Description (facultatif)');
    await description.click();
    await description.pressSequentially('Salaire');
    await expect(description).toHaveValue('Salaire');
    await expect(montant).toHaveValue('505');
    await feuille.getByRole('button', { name: /^enregistrer$/i }).click();
    await expect(page.getByText('Argent reçu enregistré').first()).toBeVisible({
      timeout: ECRITURE_MS,
    });
    await expect(feuille).toBeHidden();

    // 3. The base: the first without assignment, the second for the next month.
    const { data, error } = await admin
      .from('movements')
      .select('amount, description, budget_year, budget_month, income_nature')
      .eq('workspace_id', a.workspaceId)
      .eq('kind', 'income')
      .order('recorded_at', { ascending: true });
    if (error) throw new Error(error.message);
    expect(data).toHaveLength(2);
    expect(data![0]).toMatchObject({ budget_year: null, budget_month: null });
    expect(data![1]).toMatchObject({
      description: 'Salaire',
      income_nature: 'regular',
      budget_year: suivant.year,
      budget_month: suivant.month,
    });

    // 4. The screen: the line says which month it counts for.
    await page.reload();
    const ligne = page.locator('[data-income-line]').filter({ hasText: 'Salaire' });
    if (!(await ligne.isVisible()))
      await page.getByTestId('argent-recu').getByRole('button').first().click();
    await expect(ligne).toContainText(`pour ${nomSuivant}`);
  });

  test('le cockpit suit le mois choisi : › vers le mois suivant, ‹ pour revenir', async ({
    page,
  }) => {
    if (!admin || !a) return;
    test.setTimeout(120_000);
    const { suivant } = moisDuJourEtSuivant();
    const param = `${suivant.year}-${String(suivant.month).padStart(2, '0')}`;

    // A bill of NEXT month ticked today (lot 2: it belongs to that month).
    const { data: loyer, error: loyerError } = await admin
      .from('charges')
      .select('id')
      .eq('workspace_id', a.workspaceId)
      .eq('label', 'Loyer')
      .single();
    if (loyerError || !loyer) throw new Error(`loyer: ${loyerError?.message}`);
    const { error: payError } = await admin.from('charge_payments').insert({
      workspace_id: a.workspaceId,
      charge_id: loyer.id,
      created_by: a.userId,
      paid_from_account_type: 'income_bills',
      period_year: suivant.year,
      period_month: suivant.month,
      paid_amount: 505,
      paid_at: new Date().toISOString(),
    });
    if (payError) throw new Error(`paiement: ${payError.message}`);

    await seConnecter(page, a);
    await page.goto('/app');
    const titre = page.getByTestId('cockpit-title');
    const cascade = page.getByTestId('cascade-du-mois');
    const encore = page.getByTestId('cockpit-encore-a-payer');

    // This month: only the first income (705) counts; the bill of next month is not paid here.
    await expect(titre).not.toContainText('mois à venir');
    await expect(cascade).toContainText(/Reçu ce mois-ci 705\s€ sur 2\s505\s€ prévus/);
    await expect(encore).toContainText('0 payées sur 1');

    // › : the next month, said in the title, with its own income and its own bill paid.
    await page.getByTestId('cockpit-period-next').click();
    await expect(page).toHaveURL(new RegExp(`period=${param}`));
    await expect(titre).toContainText('mois à venir');
    await expect(titre).toContainText(String(suivant.year));
    // Tour 42 ter — another month speaks in its tense: same sums, « pour <mois> ».
    const nomMois = moisDuJourEtSuivant().nomSuivant.split(' ')[0];
    await expect(cascade).toContainText(
      new RegExp(`Reçu pour ${nomMois} : 505\\s€ sur 2\\s505\\s€ prévus`),
    );
    await expect(page.getByTestId('cockpit-title-etiquette')).toHaveText('mois à venir');
    // The title names the month; the selector no longer repeats it.
    await expect(page.getByTestId('cockpit-period-label')).toHaveCount(0);
    await expect(page.getByTestId('cockpit-il-te-reste')).toContainText('Il te restera');
    // A month not begun has no estimate: « — », never the whole budget.
    await expect(page.getByTestId('situation-epargne-estimee')).toHaveText('—');
    await expect(page.getByTestId('repli-reserve')).toContainText('Soldes d’aujourd’hui');
    // « Revenir à … » is a target of at least 44 px, measured in the page.
    const retour = page.getByTestId('cockpit-period-back');
    expect((await retour.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(encore).toContainText('1 payées sur 1');
    // Today's balance of the daily account never sits next to another month's figure.
    await expect(page.getByText(/Sur ton compte du quotidien/)).toHaveCount(0);
    const lien = page.getByTestId('cockpit-voir-factures');
    await expect(lien).toHaveAttribute('href', new RegExp(`/app/charges\\?period=${param}$`));
    await expect(lien).toContainText(/^Voir les factures d/);

    // ‹ : back to this month.
    await page.getByTestId('cockpit-period-prev').click();
    await expect(titre).not.toContainText('mois à venir');
    await expect(cascade).toContainText(/Reçu ce mois-ci 705\s€ sur 2\s505\s€ prévus/);
  });
});
