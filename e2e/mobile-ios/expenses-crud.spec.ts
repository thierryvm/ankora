import { expect } from '@playwright/test';

import { test } from './fixtures/mobile-test';

/**
 * Expenses — create, edit, delete, end to end.
 *
 * The list used to carry a muted pencil next to a red bin on every row: the eye
 * went to the bin, and @thierry believed for weeks that an expense could not be
 * edited at all. The row is now the target, and deleting — the only
 * irreversible action here — moved behind a confirmation inside the drawer that
 * names what is about to disappear.
 *
 * This spec also pins the timezone fix. The form used to default to the UTC day:
 * during Belgian summer time, between midnight and 02:00 local, it pre-filled
 * YESTERDAY, and on the first of the month the expense was filed under the
 * previous month where the current list never shows it.
 *
 * ⚠️ `seededUser`-gated: this AUTO-SKIPS in CI, where `SUPABASE_SERVICE_ROLE_KEY`
 * is deliberately absent (one Supabase project; the service_role key must not
 * reach CI). A green pipeline does NOT mean these assertions ran. To run it:
 *   set -a; . ./.env.local; set +a
 *   E2E_BASE_URL=<url> npx playwright test e2e/mobile-ios/expenses-crud.spec.ts \
 *     --project="iPhone 14" --workers=1
 */
test.describe('Expenses — full lifecycle', () => {
  test('creates, edits and deletes an expense', async ({ page, seededUser }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seededUser.email);
    await page.getByLabel('Mot de passe').fill(seededUser.password);
    await page.getByRole('button', { name: /^se connecter$/i }).click();
    await page.waitForURL(/\/app\b/, { timeout: 30_000 });
    await page.goto('/app/expenses', { waitUntil: 'networkidle' });

    // The date defaults to today in Europe/Brussels, not to the UTC day.
    const todayInBrussels = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Brussels',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    await expect(page.getByLabel(/^date$/i)).toHaveValue(todayInBrussels);

    await page.getByLabel(/libellé/i).fill('Intermarché');
    await page.getByLabel(/montant/i).fill('27');
    await page.getByRole('button', { name: /ajouter/i }).click();

    const rows = page.locator('[data-testid^="expenses-row-edit-"]');
    await rows.first().waitFor({ state: 'visible', timeout: 20_000 });
    const created = await rows.count();
    expect(created).toBeGreaterThan(0);

    // Nothing destructive is reachable from the list any more.
    await expect(page.locator('[data-testid^="expenses-row-delete-"]')).toHaveCount(0);

    // Tapping the row — not a small icon — opens the editor.
    await rows.first().click();
    await expect(page.getByTestId('expense-edit-drawer')).toBeVisible();

    // Editing works, which is what the old affordance hid.
    await page
      .getByLabel(/libellé/i)
      .last()
      .fill('Intermarché — courses');
    await page.getByTestId('expense-edit-save').click();
    await expect(page.getByTestId('expense-edit-drawer')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText('Intermarché — courses')).toBeVisible();

    // Deleting takes two steps, and the confirmation names the expense.
    await rows.first().click();
    await page.getByTestId('expense-delete-arm').click();
    const confirmation = page.getByTestId('expense-delete-confirm');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Intermarché — courses');
    await expect(confirmation).toContainText('27');

    // Backing out leaves the expense alone.
    await page.getByTestId('expense-delete-abort').click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByTestId('expense-delete-arm')).toBeVisible();

    // Confirming removes it.
    await page.getByTestId('expense-delete-arm').click();
    await page.getByTestId('expense-delete-confirmed').click();
    await expect(page.getByTestId('expense-edit-drawer')).toBeHidden({ timeout: 20_000 });
    await expect(rows).toHaveCount(created - 1, { timeout: 20_000 });
  });
});
