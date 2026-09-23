/**
 * The ⊕ expense sheet, v3 — seen as a person uses it, at 375 px.
 *
 *   (a) F-6: a NEW account has no chip ticked for it. The amount alone does not
 *       save — the button waits and a line says why. Amount, chip, save:
 *       three gestures, counted.
 *   (d) F-18: « Ajouter une note » unfolds a note that reaches the database.
 *   (c) Rule 26: « Colr » suggests « Colruyt »; choosing it fills the field and
 *       ticks the category of its family (« Courses »), even from the overflow.
 *   (b) Rule 26: a description written once, typed again in full, ticks the
 *       same chip again without a click.
 *   (e) A SECOND new account never sees the first account's descriptions.
 *
 * After every save, « Il te reste » drops by exactly the amount, and the row is
 * read back in the database. Every field is typed key by key
 * (`pressSequentially`), never filled.
 *
 * Order (a) → (d) → (c) → (b) is deliberate: (a) and (d) give the first chip two
 * uses, so at (b) the pre-selected chip is certainly NOT the one the recall
 * must tick — otherwise « ticked without a click » could pass by coincidence.
 *
 * Fictitious amounts only. Runs only against a local Supabase stack: it writes
 * expenses.
 */
import type { Page } from '@playwright/test';

import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();
type SeededUser = Awaited<ReturnType<typeof seedOnboardedUser>>;
const ECRITURE_MS = 15_000;
const DESCRIPTION = 'Marché fictif';

test.use({ viewport: { width: 375, height: 812 } });

async function seConnecter(page: Page, user: SeededUser): Promise<void> {
  await page.goto('/login');
  const email = page.getByLabel('Email');
  await email.click();
  await email.pressSequentially(user.email);
  const motDePasse = page.getByLabel('Mot de passe');
  await motDePasse.click();
  await motDePasse.pressSequentially(user.password);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL(/\/app\b/, { timeout: 20_000 });
}

/**
 * « Il te reste », in cents, read on /app once the headline has stopped
 * animating: polled until it rests on the last figure of the formula line.
 */
async function lireIlTeReste(page: Page): Promise<number> {
  await page.goto('/app');
  await expect(page.getByTestId('cockpit-formule')).toContainText('€');
  const lecture = () =>
    page.evaluate(() => {
      const enCentimes = (s: string) => {
        const t = s.replace(/[\s\u00a0\u202f€]/gu, '').replace('−', '-');
        return Math.round(Number(t.replace(/\./gu, '').replace(',', '.')) * 100);
      };
      const nombresDe = (texte: string) =>
        Array.from(texte.matchAll(/[-−]?[\d\u00a0\u202f.]*\d(?:,\d{1,2})?/gu)).map((m) => m[0]);
      const ligne = document.querySelector('[data-testid="cockpit-formule"]')?.textContent ?? '';
      const nombres = nombresDe(ligne);
      const tete = document.querySelector('[data-testid="cockpit-chiffre"]')?.textContent ?? '';
      return {
        resultat: enCentimes(nombres[nombres.length - 1] ?? 'NaN'),
        tete: enCentimes(nombresDe(tete)[0] ?? 'NaN'),
      };
    });
  await expect
    .poll(
      async () => {
        const l = await lecture();
        return l.tete === l.resultat;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  return (await lecture()).tete;
}

/** Opens ⊕ and waits for the chips — the context has landed. */
async function ouvrirFeuille(page: Page): Promise<void> {
  await page.getByTestId('bottom-tab-add-expense').click();
  await expect(page.getByTestId('add-expense-amount')).toBeVisible({ timeout: ECRITURE_MS });
  await expect(puces(page).first()).toBeVisible({ timeout: ECRITURE_MS });
}

function puces(page: Page) {
  return page.locator('[role="radio"][data-testid^="add-expense-chip-"]');
}

async function enregistrer(page: Page): Promise<void> {
  await expect(page.getByTestId('add-expense-submit')).toBeEnabled();
  await page.getByTestId('add-expense-submit').click();
  await expect(page.getByTestId('add-expense-amount')).toBeHidden({ timeout: ECRITURE_MS });
}

async function derniereDepense(workspaceId: string) {
  const { data, error } = await admin!
    .from('expenses')
    .select('label, amount, category_id, note, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`lecture dépense: ${error?.message ?? 'aucune'}`);
  return data;
}

async function idCategorie(workspaceId: string, nom: string): Promise<string> {
  const { data, error } = await admin!
    .from('categories')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', nom)
    .single();
  if (error || !data) throw new Error(`catégorie ${nom}: ${error?.message ?? 'absente'}`);
  return data.id;
}

test.describe.serial('Feuille ⊕ v3 — catégorie choisie, descriptions, note', () => {
  test.skip(!admin, 'Needs a local Supabase (E2E_SUPABASE_READY=1).');

  let a: SeededUser | null = null;
  let b: SeededUser | null = null;

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
        `Refus: cette spec ÉCRIT des dépenses et NEXT_PUBLIC_SUPABASE_URL=${url} ` +
          "n'est pas une pile locale. Elle ne tourne que contre 127.0.0.1.",
      );
    }
    a = await seedOnboardedUser(admin);
    // An income, so « Il te reste » is a figure and not the incomplete state.
    const { error } = await admin
      .from('workspaces')
      .update({ monthly_income: 2505, vie_courante_monthly_transfer: 705 })
      .eq('id', a.workspaceId);
    if (error) throw new Error(`semis revenu: ${error.message}`);
    b = await seedOnboardedUser(admin);
  });

  test.afterAll(async () => {
    if (admin && a) await deleteSeededUser(admin, a.userId);
    if (admin && b) await deleteSeededUser(admin, b.userId);
  });

  test('catégorie obligatoire, note, suggestions et rappel — le chiffre bouge du montant exact', async ({
    page,
  }) => {
    if (!admin || !a || !b) return;
    test.setTimeout(180_000);
    await seConnecter(page, a);
    const coursesId = await idCategorie(a.workspaceId, 'Courses');

    // ── (a) Compte neuf : rien de coché, trois gestes ────────────────────────
    const avant = await lireIlTeReste(page);
    await ouvrirFeuille(page);
    // The chips of the sheet only: the cockpit behind it has its own radios.
    await expect(puces(page).first()).toBeVisible();
    await expect(puces(page).and(page.locator('[aria-checked="true"]'))).toHaveCount(0);

    let gestes = 0;
    await page.getByTestId('add-expense-amount').pressSequentially('5,05');
    gestes += 1;
    await expect(page.getByTestId('add-expense-amount')).toHaveValue('5,05');
    await expect(page.getByTestId('add-expense-submit')).toBeDisabled();
    await expect(page.getByTestId('add-expense-category-required')).toHaveText(
      'Choisis une catégorie pour enregistrer.',
    );

    const premiere = puces(page).first();
    const nomPremiere = ((await premiere.textContent()) ?? '').trim();
    expect(nomPremiere.length).toBeGreaterThan(0);
    await premiere.click();
    gestes += 1;
    await expect(premiere).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('add-expense-category-required')).toBeHidden();

    await enregistrer(page);
    gestes += 1;
    expect(gestes, 'montant, puce, enregistrer').toBe(3);

    const idPremiere = await idCategorie(a.workspaceId, nomPremiere);
    const ligneA = await derniereDepense(a.workspaceId);
    expect(ligneA.label, 'sans description, la dépense porte le nom de sa catégorie').toBe(
      nomPremiere,
    );
    expect(Number(ligneA.amount)).toBeCloseTo(5.05, 2);
    expect(ligneA.category_id).toBe(idPremiere);
    const apresA = await lireIlTeReste(page);
    expect(apresA, '« Il te reste » baisse de 5,05 €').toBe(avant - 505);

    // ── (d) La note ──────────────────────────────────────────────────────────
    await ouvrirFeuille(page);
    // The first chip now has a use: it is the pre-selection.
    await expect(page.getByRole('radio', { name: nomPremiere, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByTestId('add-expense-amount').pressSequentially('7,05');
    await page.getByTestId('add-expense-note-toggle').click();
    const note = page.getByTestId('add-expense-note');
    await expect(note).toBeVisible();
    await note.pressSequentially('Note fictive 705');
    await expect(note).toHaveValue('Note fictive 705');
    await enregistrer(page);

    const ligneD = await derniereDepense(a.workspaceId);
    expect(ligneD.note).toBe('Note fictive 705');
    expect(Number(ligneD.amount)).toBeCloseTo(7.05, 2);
    expect(ligneD.category_id).toBe(idPremiere);
    const apresD = await lireIlTeReste(page);
    expect(apresD, '« Il te reste » baisse de 7,05 €').toBe(apresA - 705);

    // ── (c) « Colr » → Colruyt, qui coche Courses ────────────────────────────
    await ouvrirFeuille(page);
    await page.getByTestId('add-expense-amount').pressSequentially('50,50');
    const description = page.getByTestId('add-expense-label');
    await description.click();
    await description.pressSequentially('Colr');
    const colruyt = page
      .getByTestId('add-expense-description-option')
      .filter({ hasText: 'Colruyt' })
      .first();
    await expect(colruyt).toBeVisible();
    await colruyt.click();
    await expect(description).toHaveValue('Colruyt');
    // Visible and ticked even if « Courses » sat in the overflow (rule 25).
    await expect(page.getByTestId(`add-expense-chip-${coursesId}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await enregistrer(page);

    const ligneC = await derniereDepense(a.workspaceId);
    expect(ligneC.label).toBe('Colruyt');
    expect(ligneC.category_id).toBe(coursesId);
    expect(Number(ligneC.amount)).toBeCloseTo(50.5, 2);
    const apresC = await lireIlTeReste(page);
    expect(apresC, '« Il te reste » baisse de 50,50 €').toBe(apresD - 5_050);

    // ── (b1) Une description neuve, sous une autre puce ──────────────────────
    await ouvrirFeuille(page);
    await page.getByTestId('add-expense-amount').pressSequentially('70,50');
    const descriptionB1 = page.getByTestId('add-expense-label');
    await descriptionB1.click();
    await descriptionB1.pressSequentially(DESCRIPTION);
    await expect(descriptionB1).toHaveValue(DESCRIPTION);
    // A chip that is neither the pre-selected one nor « Courses ».
    const autre = page
      .locator('[role="radio"][data-testid^="add-expense-chip-"][aria-checked="false"]')
      .filter({ hasNotText: /^Courses$/ })
      .first();
    const nomAutre = ((await autre.textContent()) ?? '').trim();
    expect(nomAutre).not.toBe(nomPremiere);
    await autre.click();
    await expect(page.getByRole('radio', { name: nomAutre, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await enregistrer(page);

    const idAutre = await idCategorie(a.workspaceId, nomAutre);
    const ligneB1 = await derniereDepense(a.workspaceId);
    expect(ligneB1.label).toBe(DESCRIPTION);
    expect(ligneB1.category_id).toBe(idAutre);
    const apresB1 = await lireIlTeReste(page);
    expect(apresB1, '« Il te reste » baisse de 70,50 €').toBe(apresC - 7_050);

    // ── (b2) La même description, tapée en entier : la puce revient seule ────
    await ouvrirFeuille(page);
    const puceAutre = page.getByTestId(`add-expense-chip-${idAutre}`);
    // Not ticked before typing — otherwise the next assertion proves nothing.
    await expect(page.getByRole('radio', { name: nomPremiere, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(puceAutre).not.toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('add-expense-amount').pressSequentially('5,70');
    const descriptionB2 = page.getByTestId('add-expense-label');
    await descriptionB2.click();
    await descriptionB2.pressSequentially('M');
    // Control for (e): the probe does see an own description when there is one.
    await expect(
      page.getByTestId('add-expense-description-option').filter({ hasText: DESCRIPTION }),
    ).toBeVisible();
    await descriptionB2.pressSequentially(DESCRIPTION.slice(1));
    await expect(descriptionB2).toHaveValue(DESCRIPTION);
    await expect(puceAutre, 'la même puce, cochée sans clic').toHaveAttribute(
      'aria-checked',
      'true',
    );
    await enregistrer(page);

    const ligneB2 = await derniereDepense(a.workspaceId);
    expect(ligneB2.label).toBe(DESCRIPTION);
    expect(ligneB2.category_id).toBe(idAutre);
    const apresB2 = await lireIlTeReste(page);
    expect(apresB2, '« Il te reste » baisse de 5,70 €').toBe(apresB1 - 570);

    // ── (e) Un second compte ne voit rien du premier ─────────────────────────
    await page.context().clearCookies();
    await seConnecter(page, b);
    await ouvrirFeuille(page);
    const descriptionE = page.getByTestId('add-expense-label');
    await descriptionE.click();
    await descriptionE.pressSequentially(DESCRIPTION.slice(0, 1));
    const options = page.getByTestId('add-expense-description-option');
    // The list is open (brands starting with « M »), so its absence below is a
    // reading of a list that exists, not of an empty page.
    await expect(options.first()).toBeVisible();
    await expect(options.filter({ hasText: DESCRIPTION })).toHaveCount(0);
  });
});
