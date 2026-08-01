import { expect } from '@playwright/test';

import { test } from './fixtures/mobile-test';

/**
 * Expenses — create, edit, delete, end to end.
 *
 * ## Pourquoi cette spec a été réécrite (1er août 2026)
 *
 * Elle pilotait un formulaire INLINE sur `/app/expenses` — champs « date »,
 * « libellé », « montant », bouton « ajouter ». Le chantier 2 a remplacé cette
 * saisie par `AddExpenseSheet`, ouverte depuis le ⊕ au centre de la barre
 * d'onglets : montant d'abord, deux taps, catégorie incluse. Le formulaire
 * inline n'existe plus, donc `getByLabel(/^date$/i)` ne trouvait plus rien.
 *
 * La spec n'a pas été alignée en même temps que la refonte, et la CI n'a tourné
 * sur AUCUNE branche du chantier — l'échec n'est apparu qu'une fois le merge en
 * production. Conséquence à retenir : pendant tout le chantier, le nouveau
 * parcours de saisie n'a eu **aucune couverture e2e**. La réparer ne consiste
 * donc pas à faire verdir, mais à rendre au parcours livré la couverture que
 * l'ancien avait.
 *
 * La moitié édition/suppression est conservée telle quelle : ces surfaces
 * (`expenses-row-edit-*`, `expense-edit-drawer`, la confirmation nommée) n'ont
 * pas changé, et elles portent le correctif d'origine — la ligne est la cible,
 * la suppression passe derrière une confirmation qui nomme ce qui disparaît.
 *
 * Le contrôle de fuseau reste, sous sa forme actuelle : la feuille pré-remplit
 * le jour à Europe/Brussels, pas le jour UTC. Entre minuit et 02:00 en heure
 * d'été belge, l'ancien formulaire pré-remplissait HIER, et le 1er du mois la
 * dépense partait dans le mois précédent, que la liste courante n'affiche pas.
 *
 * ⚠️ `seededUser`-gated : AUTO-SKIP là où `SUPABASE_SERVICE_ROLE_KEY` est absent.
 * Le job `Playwright E2E (authenticated)` la fait tourner pour de vrai contre une
 * stack Supabase locale. Une pipeline verte ailleurs ne veut PAS dire que ces
 * assertions ont tourné.
 */
test.describe('Expenses — full lifecycle', () => {
  test('creates an expense from the ⊕ sheet, then edits and deletes it', async ({
    page,
    seededUser,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 30_000 });
    await page.goto('/app/expenses', { waitUntil: 'networkidle' });

    const rows = page.locator('[data-testid^="expenses-row-edit-"]');
    const before = await rows.count();

    // ── Création : elle commence au ⊕, plus à un formulaire de la page ──────
    await page.getByTestId('bottom-tab-add-expense').click();
    await expect(page.getByTestId('add-expense-amount')).toBeVisible();

    // « Montant d'abord » : tant qu'il ne s'analyse pas, on ne peut pas valider.
    // C'est le contrat d'entrée de la feuille, et il est vérifiable sans dépendre
    // du focus automatique — dont le comportement varie entre moteurs.
    await expect(page.getByTestId('add-expense-submit')).toBeDisabled();

    // Le jour pré-rempli est celui de Bruxelles, pas celui d'UTC.
    const todayInBrussels = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Brussels',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    await expect(page.getByTestId('add-expense-date')).toHaveValue(todayInBrussels);
    // Le champ natif ne sait dire que « 01/08/2026 » ; la feuille nomme le jour.
    await expect(page.getByTestId('add-expense-date-friendly')).toHaveText("Aujourd'hui");

    await page.getByTestId('add-expense-amount').fill('27');
    await page.getByTestId('add-expense-label').fill('Intermarché');

    // Catégorie : prise génériquement, jamais par son nom. La taxonomie à 18
    // catégories dépend de la migration `20260729000002`, qui n'est PAS
    // appliquée en production — nommer « Courses » ici coupleraient la spec à
    // une migration en attente et la ferait échouer selon l'environnement.
    // Elle est facultative à la saisie (`canSubmit` ne regarde que le montant),
    // donc on n'en exige pas la présence.
    const chips = page.locator(
      '[data-testid^="add-expense-chip-"]:not([data-testid$="-skeleton"]):not([data-testid$="-more"])',
    );
    if ((await chips.count()) > 0) {
      await chips.first().click();
    }

    await expect(page.getByTestId('add-expense-submit')).toBeEnabled();
    await page.getByTestId('add-expense-submit').click();

    // Succès = la feuille se ferme d'elle-même (`onClose()` après l'action).
    await expect(page.getByTestId('add-expense-amount')).toBeHidden({ timeout: 20_000 });

    // ── La dépense a bien été écrite, pas seulement affichée en optimiste ────
    await page.goto('/app/expenses', { waitUntil: 'networkidle' });
    await rows.first().waitFor({ state: 'visible', timeout: 20_000 });
    const created = await rows.count();
    expect(created).toBe(before + 1);
    await expect(page.getByText('Intermarché').first()).toBeVisible();

    // Rien de destructif n'est atteignable depuis la liste.
    await expect(page.locator('[data-testid^="expenses-row-delete-"]')).toHaveCount(0);

    // ── Édition : taper la LIGNE, pas une petite icône ──────────────────────
    await rows.first().click();
    await expect(page.getByTestId('expense-edit-drawer')).toBeVisible();

    await page
      .getByLabel(/libellé/i)
      .last()
      .fill('Intermarché — courses');
    await page.getByTestId('expense-edit-save').click();
    await expect(page.getByTestId('expense-edit-drawer')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText('Intermarché — courses')).toBeVisible();

    // ── Suppression : deux temps, et la confirmation nomme la dépense ───────
    await rows.first().click();
    await page.getByTestId('expense-delete-arm').click();
    const confirmation = page.getByTestId('expense-delete-confirm');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Intermarché — courses');
    await expect(confirmation).toContainText('27');

    // Reculer laisse la dépense tranquille.
    await page.getByTestId('expense-delete-abort').click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByTestId('expense-delete-arm')).toBeVisible();

    // Confirmer la retire.
    await page.getByTestId('expense-delete-arm').click();
    await page.getByTestId('expense-delete-confirmed').click();
    await expect(page.getByTestId('expense-edit-drawer')).toBeHidden({ timeout: 20_000 });
    await expect(rows).toHaveCount(created - 1, { timeout: 20_000 });
  });
});
