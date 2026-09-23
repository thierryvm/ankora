/**
 * PR E2 — the ⊕ expense sheet in the v3 shape, used as a person uses it, at 375 px.
 *
 * On a NEW account (no expense yet):
 *   1. nothing is pre-checked, and « Ajouter » without a category is refused
 *      (F-6) — on screen, and nothing reaches the database;
 *   2. a description of the person's own, then a category: recorded;
 *   3. a chain from the built-in list (F-34), chosen among the suggestions,
 *      checks its category family; a note is added (F-18);
 *   4. the first description typed again recalls ITS category (F-20), which
 *      differs from the one the usage now pre-selects;
 *   5. « Il te reste » drops by the exact amount after each expense.
 * A second account then types the start of the first account's description:
 * no suggestion carries it (the read goes through RLS, rule 26).
 *
 * Every field is typed key by key (`pressSequentially`), read back on screen,
 * then in the database. Fictitious amounts only. Runs only against a local
 * Supabase stack: it writes expenses.
 */
import type { Page } from '@playwright/test';

import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();
type SeededUser = Awaited<ReturnType<typeof seedOnboardedUser>>;
const ECRITURE_MS = 15_000;
const MINE = 'Boulangerie Zéphyr';

test.use({ viewport: { width: 375, height: 812 } });

async function seConnecter(page: Page, user: SeededUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL(/\/app\b/, { timeout: 20_000 });
}

/** « Il te reste », in cents, read on the cockpit once its figure has settled. */
async function ilTeReste(page: Page): Promise<number> {
  await page.goto('/app');
  const chiffre = page.getByTestId('cockpit-chiffre');
  await expect(chiffre).toContainText('€');
  const lire = async () => {
    const t = (await chiffre.textContent()) ?? '';
    const n = t.match(/[-−]?[\d  .]*\d(?:,\d{1,2})?/u)?.[0] ?? 'NaN';
    return Math.round(
      Number(
        n
          .replace(/[\s  .]/gu, '')
          .replace('−', '-')
          .replace(',', '.'),
      ) * 100,
    );
  };
  let precedent = Number.NaN;
  await expect
    .poll(async () => {
      const v = await lire();
      const stable = v === precedent;
      precedent = v;
      return stable;
    })
    .toBe(true);
  return precedent;
}

async function ouvrirFeuille(page: Page): Promise<void> {
  await page.goto('/app/expenses');
  const feuille = page.getByTestId('add-expense-sheet');
  await expect(async () => {
    await page.getByTestId('expenses-open-add-sheet').click();
    await expect(feuille).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  // The context (chips, descriptions) has landed once a chip is on screen.
  await expect(feuille.getByRole('radio').first()).toBeVisible({ timeout: ECRITURE_MS });
}

async function taper(page: Page, testId: string, valeur: string): Promise<void> {
  const champ = page.getByTestId(testId);
  await champ.click();
  await champ.pressSequentially(valeur, { delay: 20 });
  await expect(champ).toHaveValue(valeur);
}

async function lignes(user: SeededUser) {
  const { data } = await admin!
    .from('expenses')
    .select('label, amount, category_id, note, created_at')
    .eq('workspace_id', user.workspaceId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

async function categorieId(user: SeededUser, nom: string): Promise<string> {
  const { data } = await admin!
    .from('categories')
    .select('id')
    .eq('workspace_id', user.workspaceId)
    .eq('name', nom)
    .single();
  return data!.id;
}

test.describe('⊕ — saisie v3 (F-6, F-18, F-20, F-34, règle 26)', () => {
  test.skip(!admin, 'needs a local Supabase stack (service role)');

  test('première dépense, enseigne, note, rappel — et « Il te reste » au centime', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const user = await seedOnboardedUser(admin!);
    try {
      await admin!.from('workspaces').update({ monthly_income: 2505 }).eq('id', user.workspaceId);
      await seConnecter(page, user);
      const r0 = await ilTeReste(page);

      // 1 — F-6: nothing pre-checked, refused without a category.
      await ouvrirFeuille(page);
      const radios = page.getByTestId('add-expense-sheet').getByRole('radio');
      const n = await radios.count();
      for (let i = 0; i < n; i += 1) {
        await expect(radios.nth(i)).toHaveAttribute('aria-checked', 'false');
      }
      await taper(page, 'add-expense-amount', '12,34');
      await taper(page, 'add-expense-label', MINE);
      await page.getByTestId('add-expense-submit').click();
      await expect(page.getByTestId('add-expense-category-required')).toBeVisible();
      expect(await lignes(user)).toHaveLength(0);

      // 2 — the person's category, other than Courses so the recall below
      // cannot be mistaken for the usage pre-selection.
      const autre = page
        .getByTestId('add-expense-sheet')
        .getByRole('radio')
        .filter({ hasNotText: /^Courses$/ })
        .first();
      const nomAutre = ((await autre.textContent()) ?? '').trim();
      await autre.click();
      await expect(autre).toHaveAttribute('aria-checked', 'true');
      await page.getByTestId('add-expense-submit').click();
      await expect.poll(async () => (await lignes(user)).length, { timeout: ECRITURE_MS }).toBe(1);
      const idAutre = await categorieId(user, nomAutre);
      expect((await lignes(user))[0]).toMatchObject({
        label: MINE,
        amount: 12.34,
        category_id: idAutre,
        note: null,
      });
      const r1 = await ilTeReste(page);
      expect(r1).toBe(r0 - 1234);

      // 3 — a chain from the built-in list, chosen among the suggestions; a note.
      await ouvrirFeuille(page);
      await taper(page, 'add-expense-amount', '23,45');
      await taper(page, 'add-expense-label', 'colr');
      const options = page.getByTestId('add-expense-label-suggestions').getByRole('option');
      await expect(options.first()).toBeVisible();
      await options
        .filter({ hasText: /^Colruyt/ })
        .first()
        .click();
      await expect(page.getByTestId('add-expense-label')).toHaveValue('Colruyt');
      const courses = page
        .getByTestId('add-expense-sheet')
        .getByRole('radio', { name: 'Courses', exact: true });
      await expect(courses).toHaveAttribute('aria-checked', 'true');
      await page.getByTestId('add-expense-note-toggle').click();
      await taper(page, 'add-expense-note', 'ticket gardé');
      await page.getByTestId('add-expense-submit').click();
      await expect.poll(async () => (await lignes(user)).length, { timeout: ECRITURE_MS }).toBe(2);
      expect((await lignes(user))[1]).toMatchObject({
        label: 'Colruyt',
        amount: 23.45,
        category_id: await categorieId(user, 'Courses'),
        note: 'ticket gardé',
      });
      const r2 = await ilTeReste(page);
      expect(r2).toBe(r1 - 2345);

      // 4 — F-20: the first description, typed again, recalls ITS category.
      // A second Courses expense (written directly, fictitious) makes Courses
      // the most used, so the usage pre-selects it: the recall must then move
      // the check to the OTHER category, which a pre-selection could not do.
      const { error: seedError } = await admin!.from('expenses').insert({
        workspace_id: user.workspaceId,
        created_by: user.userId,
        label: 'Lidl',
        amount: 1,
        occurred_on: new Date().toISOString().slice(0, 10),
        category_id: await categorieId(user, 'Courses'),
        note: null,
      });
      expect(seedError).toBeNull();
      const r3 = await ilTeReste(page);
      await ouvrirFeuille(page);
      await expect(courses).toHaveAttribute('aria-checked', 'true');
      await taper(page, 'add-expense-amount', '7,5');
      // The person's description comes before any chain.
      await taper(page, 'add-expense-label', 'Boul');
      await expect(options.first()).toHaveText(new RegExp(`^${MINE}`));
      await page
        .getByTestId('add-expense-label')
        .pressSequentially('angerie Zéphyr', { delay: 20 });
      await expect(page.getByTestId('add-expense-label')).toHaveValue(MINE);
      await expect(
        page.getByTestId('add-expense-sheet').getByRole('radio', { name: nomAutre, exact: true }),
      ).toHaveAttribute('aria-checked', 'true');
      await page.getByTestId('add-expense-submit').click();
      await expect.poll(async () => (await lignes(user)).length, { timeout: ECRITURE_MS }).toBe(4);
      expect((await lignes(user))[3]).toMatchObject({
        label: MINE,
        amount: 7.5,
        category_id: idAutre,
      });
      expect(r3).toBe(r2 - 100);
      expect(await ilTeReste(page)).toBe(r3 - 750);

      // The page: the month total opens on its categories and descriptions.
      await page.goto('/app/expenses');
      await expect(page.getByTestId('depense-mois-total')).toContainText('44,29');
      const cat = page.getByTestId('depense-categorie').filter({ hasText: nomAutre });
      await expect(cat).toHaveAttribute('data-total', '1984');
      await cat.locator('summary').click();
      await expect(cat.locator(`[data-libelle-groupe="${MINE}"]`)).toHaveAttribute(
        'data-sous-total',
        '1984',
      );
    } finally {
      await deleteSeededUser(admin!, user.userId);
    }
  });

  test("les suggestions ne sortent jamais de l'espace de la personne", async ({ page }) => {
    test.setTimeout(120_000);
    const a = await seedOnboardedUser(admin!);
    const b = await seedOnboardedUser(admin!);
    try {
      const { error } = await admin!.from('expenses').insert({
        workspace_id: a.workspaceId,
        created_by: a.userId,
        label: MINE,
        amount: 3,
        occurred_on: new Date().toISOString().slice(0, 10),
        category_id: await categorieId(a, 'Courses'),
        note: null,
      });
      expect(error).toBeNull();

      await seConnecter(page, b);
      await ouvrirFeuille(page);
      await taper(page, 'add-expense-label', 'boul');
      // Nothing of A's: no option (no chain starts with « boul » either).
      await expect(page.getByTestId('add-expense-label-suggestions')).toHaveCount(0);
      await expect(page.getByTestId('add-expense-label')).toHaveAttribute('aria-expanded', 'false');
      // The instrument works for B: a chain does open the list.
      await page.getByTestId('add-expense-label').fill('');
      await taper(page, 'add-expense-label', 'colr');
      await expect(
        page.getByTestId('add-expense-label-suggestions').getByRole('option').first(),
      ).toHaveText(/^Colruyt/);
    } finally {
      await deleteSeededUser(admin!, a.userId);
      await deleteSeededUser(admin!, b.userId);
    }
  });
});
