/**
 * PR D — the formula of « Il te reste », seen as a person uses it, at 375 px.
 *
 *   Il te reste = Revenus − Déjà compté pour tes factures − Mis de côté − Dépensé
 *
 * Four gestures, one figure read after each:
 *   1. a transfer to provisions WITH a free part lowers the figure by exactly
 *      that free part;
 *   2. cancelling it brings the figure back to the cent;
 *   3. money received « on top of the income » raises it by exactly its amount;
 *   4. a PART of the month's income (issue #483) leaves it where it was, and
 *      the cascade says « Reçu ce mois-ci X sur Y prévus ».
 * At every step the formula line is recomputed IN THE PAGE and must land on
 * the headline figure. Every field is typed key by key (`pressSequentially`),
 * read back on screen, then in the database.
 *
 * Fictitious amounts only (the 505 € / 705 € family). Runs only against a local
 * Supabase stack: it writes operations.
 */
import type { Page } from '@playwright/test';

import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';
import { ouvrirRepli } from './helpers/cockpit';

const admin = adminClientOrNull();
type SeededUser = Awaited<ReturnType<typeof seedOnboardedUser>>;
const ECRITURE_MS = 15_000;

test.use({ viewport: { width: 375, height: 812 } });

async function seConnecter(page: Page, user: SeededUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL(/\/app\b/, { timeout: 20_000 });
}

async function ouvrirFeuille(
  page: Page,
  bouton: ReturnType<Page['getByRole']>,
  testId: string,
): Promise<void> {
  const feuille = page.getByTestId(testId);
  await expect(async () => {
    await bouton.click();
    await expect(feuille).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

type Lecture = { termes: number[]; resultat: number; tete: number; misDeCote: boolean };

/**
 * Reads the formula line and the headline figure, IN THE PAGE, in cents. The
 * headline figure animates (~420 ms): poll until it rests on the value the line
 * states — then assert that the line's own arithmetic lands on it.
 */
async function lire(page: Page): Promise<Lecture> {
  await page.goto('/app');
  const formule = page.getByTestId('cockpit-formule');
  await expect(formule).toContainText('€');
  const lireDansLaPage = () =>
    page.evaluate(() => {
      const enCentimes = (s: string) => {
        const t = s.replace(/[\s\u00a0\u202f€]/gu, '').replace('−', '-');
        return Math.round(Number(t.replace(/\./gu, '').replace(',', '.')) * 100);
      };
      const ligne = document.querySelector('[data-testid="cockpit-formule"]')!;
      const spans = Array.from(ligne.querySelectorAll('span'));
      const nombresDe = (texte: string) =>
        Array.from(texte.matchAll(/[-−]?[\d\u00a0\u202f.]*\d(?:,\d{1,2})?/gu)).map((m) => m[0]);
      const nombres = spans.flatMap((s) => nombresDe(s.textContent ?? ''));
      const valeurs = nombres.map(enCentimes);
      // The headline may carry its value twice (the moving figure and its
      // sr-only live region): the first number is the one on screen.
      const tete = document.querySelector('[data-testid="cockpit-chiffre"]')?.textContent ?? '';
      return {
        termes: valeurs.slice(0, -1),
        resultat: valeurs[valeurs.length - 1]!,
        tete: enCentimes(nombresDe(tete)[0] ?? 'NaN'),
        misDeCote: (ligne.textContent ?? '').includes('Mis de côté'),
      };
    });
  await expect
    .poll(
      async () => {
        const l = await lireDansLaPage();
        return l.tete === l.resultat;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  const l = await lireDansLaPage();
  // Revenus − Déjà compté [− Mis de côté] − Dépensé = résultat, to the cent.
  const [revenus, ...retraits] = l.termes as [number, ...number[]];
  expect(revenus - retraits.reduce((a, b) => a + b, 0), 'la ligne refait le chiffre').toBe(
    l.resultat,
  );
  return l;
}

/**
 * The ⊕ sheet's starting figure, read WITHOUT navigating: the sheet lives in
 * the layout's tab bar, and a `page.goto` would remount it — which is exactly
 * what hid the stale figure (it was kept from the FIRST open, for the life of
 * the component). Waits for the headline to rest on `attendu`, opens ⊕, reads
 * « Il te reste X » in cents, closes. Returns [headline, sheet].
 */
async function lireFeuilleAjout(page: Page, attendu: number): Promise<[number, number]> {
  const enCentimes = (s: string) => {
    const n = s.match(/[-−]?[\d\u00a0\u202f.]*\d(?:,\d{1,2})?/u)?.[0] ?? 'NaN';
    const t = n.replace(/[\s\u00a0\u202f]/gu, '').replace('−', '-');
    return Math.round(Number(t.replace(/\./gu, '').replace(',', '.')) * 100);
  };
  const tete = page.getByTestId('cockpit-chiffre');
  await expect
    .poll(async () => enCentimes((await tete.textContent()) ?? ''), { timeout: ECRITURE_MS })
    .toBe(attendu);
  const valeurTete = enCentimes((await tete.textContent()) ?? '');

  await page.getByTestId('bottom-tab-add-expense').click();
  const projection = page.getByTestId('add-expense-projection');
  await expect(projection).toBeVisible({ timeout: ECRITURE_MS });
  const valeurFeuille = enCentimes((await projection.textContent()) ?? '');
  await page.keyboard.press('Escape');
  await expect(projection).toBeHidden();
  return [valeurTete, valeurFeuille];
}

test.describe.serial('« Il te reste » — la formule de la PR D, geste par geste', () => {
  test.skip(!admin, 'Needs a local Supabase (E2E_SUPABASE_READY=1).');

  let a: SeededUser | null = null;

  test.beforeAll(async () => {
    if (!admin) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      host = '';
    }
    if (host !== '127.0.0.1') {
      throw new Error(
        `Refus: cette spec ÉCRIT des opérations et NEXT_PUBLIC_SUPABASE_URL=${url} ` +
          "n'est pas une pile locale. Elle ne tourne que contre 127.0.0.1.",
      );
    }
    a = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 505, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
      // 1 800 a year: 150 of provisions a month, so the plan proposes a
      // transfer to the provisions account.
      { label: 'Assurance', amount: 1800, frequency: 'annual', dueMonth: 11, paidFrom: 'epargne' },
    ]);
    const { error } = await admin
      .from('workspaces')
      .update({ monthly_income: 2505, vie_courante_monthly_transfer: 705 })
      .eq('id', a.workspaceId);
    if (error) throw new Error(`semis revenu: ${error.message}`);
  });

  test.afterAll(async () => {
    if (admin && a) await deleteSeededUser(admin, a.userId);
  });

  test('part libre, annulation, argent reçu en plus : le chiffre bouge du montant exact', async ({
    page,
  }) => {
    if (!admin || !a) return;
    test.setTimeout(150_000);
    await seConnecter(page, a);

    const avant = await lire(page);
    expect(avant.misDeCote, 'aucun « Mis de côté » sans virement').toBe(false);

    // The ⊕ sheet is opened ONCE before any gesture: that first read is the
    // one it used to keep.
    expect(await lireFeuilleAjout(page, avant.resultat), '⊕ lit le chiffre de tête').toEqual([
      avant.resultat,
      avant.resultat,
    ]);

    // 1. The transfer to provisions, from the cockpit, 50 € above the proposal.
    await ouvrirRepli(page, 'repli-virements');
    await ouvrirFeuille(
      page,
      page.getByRole('button', {
        name: 'J’ai fait ce virement : Virement à faire vers Provisions pour tes factures',
      }),
      'feuille-virement',
    );
    const feuille = page.getByTestId('feuille-virement');
    const champ = feuille.getByLabel('Combien as-tu viré ?');
    const propose = Number((await champ.inputValue()).replace(',', '.'));
    expect(propose).toBeGreaterThan(0);
    const vire = (propose + 50).toFixed(2).replace('.', ',');
    await champ.click();
    await champ.press('Control+a');
    await champ.press('Backspace');
    await champ.pressSequentially(vire);
    await expect(champ).toHaveValue(vire);
    await feuille.getByRole('button', { name: /^enregistrer$/i }).click();
    await expect(page.getByText('Virement enregistré').first()).toBeVisible({
      timeout: ECRITURE_MS,
    });

    // Same page, no navigation: the headline refreshes in place, and the ⊕
    // sheet reopened now must start from the NEW figure, to the cent.
    expect(
      await lireFeuilleAjout(page, avant.resultat - 5_000),
      '⊕ après le virement : le chiffre de tête, pas celui de la première ouverture',
    ).toEqual([avant.resultat - 5_000, avant.resultat - 5_000]);

    const apresVirement = await lire(page);
    expect(apresVirement.misDeCote, '« Mis de côté » paraît').toBe(true);
    expect(apresVirement.resultat, 'baisse exacte de la part libre').toBe(avant.resultat - 5_000);

    // In the database: the free part, exactly, and the whole amount.
    const { data: virements } = await admin
      .from('movements')
      .select('id, amount, provision_part, free_savings_part, cancelled_at')
      .eq('workspace_id', a.workspaceId)
      .eq('to_account_type', 'provisions');
    expect(virements).toHaveLength(1);
    expect(Number(virements![0]!.free_savings_part)).toBe(50);
    expect(Number(virements![0]!.amount)).toBeCloseTo(propose + 50, 2);

    // 2. Cancel it, at the place it was made (rule 11). `lire` navigated to
    // /app, which remounted ⊕: open it once on this mount BEFORE cancelling,
    // so that the reading after the cancellation is a reopening.
    await lireFeuilleAjout(page, avant.resultat - 5_000);
    await ouvrirRepli(page, 'repli-virements');
    const fait = page
      .getByTestId('virement-fait')
      .filter({ has: page.getByRole('button', { name: 'Annuler' }) });
    await expect(async () => {
      await fait.first().getByRole('button', { name: 'Annuler' }).click();
      await expect(page.getByText('Virement annulé').first()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: ECRITURE_MS });

    // Read again after the cancellation, still without navigating (⊕ was
    // opened on this mount before cancelling, see above).
    expect(
      await lireFeuilleAjout(page, avant.resultat),
      '⊕ après l’annulation : le chiffre de tête, au centime',
    ).toEqual([avant.resultat, avant.resultat]);

    const apresAnnulation = await lire(page);
    expect(apresAnnulation.misDeCote).toBe(false);
    expect(apresAnnulation.resultat, "l'annulation remonte le chiffre au centime").toBe(
      avant.resultat,
    );

    // 3. Money received « on top of the income », from Mes comptes.
    await page.goto('/app/accounts');
    await ouvrirFeuille(
      page,
      page.getByRole('button', { name: 'Argent reçu', exact: true }),
      'feuille-argent-recu',
    );
    const recu = page.getByTestId('feuille-argent-recu');
    const montant = recu.getByLabel('Combien as-tu reçu ?');
    await montant.click();
    await montant.press('Control+a');
    await montant.press('Backspace');
    await montant.pressSequentially('120');
    await recu.getByRole('radio', { name: 'En plus de mon revenu' }).check();
    const description = recu.getByLabel('Description (facultatif)');
    await description.click();
    await description.pressSequentially('Remboursement fictif');
    await expect(description).toHaveValue('Remboursement fictif');
    await expect(montant).toHaveValue('120');
    await expect(recu.getByRole('radio', { name: 'En plus de mon revenu' })).toBeChecked();
    await recu.getByRole('button', { name: /^enregistrer$/i }).click();
    await expect(page.getByText('Argent reçu enregistré').first()).toBeVisible({
      timeout: ECRITURE_MS,
    });

    const apresRecu = await lire(page);
    expect(apresRecu.resultat, 'hausse exacte de l’argent reçu en plus').toBe(
      avant.resultat + 12_000,
    );

    const { data: revenus } = await admin
      .from('movements')
      .select('amount, income_nature, description, cancelled_at')
      .eq('workspace_id', a.workspaceId)
      .eq('kind', 'income');
    expect(revenus).toEqual([
      {
        amount: 120,
        income_nature: 'extra',
        description: 'Remboursement fictif',
        cancelled_at: null,
      },
    ]);

    // 4. Issue #483 — a PART of the month's income (1 200 of the 2 505
    // written). The base income is the greater of the two: the headline must
    // NOT move, and the cascade says what was received out of what was planned.
    await page.goto('/app/accounts');
    await ouvrirFeuille(
      page,
      page.getByRole('button', { name: 'Argent reçu', exact: true }),
      'feuille-argent-recu',
    );
    const partiel = page.getByTestId('feuille-argent-recu');
    const montantPartiel = partiel.getByLabel('Combien as-tu reçu ?');
    await montantPartiel.click();
    await montantPartiel.press('Control+a');
    await montantPartiel.press('Backspace');
    await montantPartiel.pressSequentially('1200');
    await partiel.getByRole('radio', { name: 'Mon revenu du mois' }).check();
    const descriptionPartiel = partiel.getByLabel('Description (facultatif)');
    await descriptionPartiel.click();
    await descriptionPartiel.pressSequentially('Premier versement fictif');
    await expect(montantPartiel).toHaveValue('1200');
    await expect(descriptionPartiel).toHaveValue('Premier versement fictif');
    await expect(partiel.getByRole('radio', { name: 'Mon revenu du mois' })).toBeChecked();
    await partiel.getByRole('button', { name: /^enregistrer$/i }).click();
    await expect(page.getByText('Argent reçu enregistré').first()).toBeVisible({
      timeout: ECRITURE_MS,
    });

    const apresPartiel = await lire(page);
    expect(apresPartiel.resultat, 'un versement partiel ne fait pas baisser le chiffre').toBe(
      apresRecu.resultat,
    );
    expect(apresPartiel.tete).toBe(apresRecu.tete);

    await ouvrirRepli(page, 'cockpit-repli-cascade');
    const phrase = page.locator('[data-revenu-recu-differe]');
    await expect(phrase).toBeVisible();
    await expect(phrase).toHaveText(
      /^Reçu ce mois-ci 1[\s\u00a0\u202f.]?200(?:,00)?[\s\u00a0\u202f]€ sur 2[\s\u00a0\u202f.]?505(?:,00)?[\s\u00a0\u202f]€ prévus$/u,
    );

    const { data: reguliers } = await admin
      .from('movements')
      .select('amount, income_nature, description, cancelled_at')
      .eq('workspace_id', a.workspaceId)
      .eq('kind', 'income')
      .eq('income_nature', 'regular');
    expect(reguliers).toEqual([
      {
        amount: 1200,
        income_nature: 'regular',
        description: 'Premier versement fictif',
        cancelled_at: null,
      },
    ]);
  });
});
