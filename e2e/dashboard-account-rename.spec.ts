import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

test.describe('Dashboard — typed account cards + inline rename (PR-D2)', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test('user clicks the Compte Principal title, types Belfius, presses Enter — value persists', async ({
    page,
  }) => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin, [
      {
        label: 'Loyer',
        amount: 800,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // Locate the income_bills card via the data attribute that AccountCard exposes.
      const card = page.locator('[data-account-type="income_bills"]');
      await expect(card).toBeVisible();

      // Default name comes from the i18n default (Compte Principal in fr-BE).
      await expect(card.getByRole('button', { name: /Renommer le compte/i })).toContainText(
        'Compte Principal',
      );

      // Click the title → input appears prefilled.
      await card.getByRole('button', { name: /Renommer le compte/i }).click();
      const input = card.getByRole('textbox');
      await expect(input).toBeFocused();
      await expect(input).toHaveValue('Compte Principal');

      // Replace the value and submit with Enter.
      await input.fill('Belfius');
      await input.press('Enter');

      // Optimistic update + revalidatePath: the title is back as a button with the new value.
      await expect(
        card.getByRole('button', { name: /Renommer le compte « Belfius »/i }),
      ).toBeVisible();

      // Refresh and assert persistence.
      await page.reload();
      await expect(
        page.locator('[data-account-type="income_bills"]').getByRole('button', {
          name: /Renommer le compte « Belfius »/i,
        }),
      ).toBeVisible();

      // Confirm DB state via admin client (defensive).
      const { data: row, error } = await admin
        .from('accounts')
        .select('display_name, account_type')
        .eq('workspace_id', user.workspaceId)
        .eq('account_type', 'income_bills')
        .single();
      expect(error).toBeNull();
      expect(row?.display_name).toBe('Belfius');
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('Esc cancels the rename without persisting', async ({ page }) => {
    if (!admin) return;

    const user = await seedOnboardedUser(admin, []);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // Without charges the dashboard renders an empty-state card and not the
      // typed account cards. Provide one so the cards render.
      await admin.from('charges').insert({
        workspace_id: user.workspaceId,
        created_by: user.userId,
        label: 'Test',
        amount: 100,
        frequency: 'monthly',
        due_month: 1,
        is_active: true,
        paid_from: 'principal',
      });
      await page.reload();

      const card = page.locator('[data-account-type="provisions"]');
      await expect(card).toBeVisible();

      await card.getByRole('button', { name: /Renommer le compte/i }).click();
      const input = card.getByRole('textbox');
      await input.fill('Should not persist');
      await input.press('Escape');

      // Back to button with the original (i18n default) name.
      await expect(
        card.getByRole('button', { name: /Renommer le compte « Compte Épargne »/i }),
      ).toBeVisible();

      // DB unchanged.
      const { data: row } = await admin
        .from('accounts')
        .select('display_name')
        .eq('workspace_id', user.workspaceId)
        .eq('account_type', 'provisions')
        .single();
      expect(row?.display_name).toBe('Compte Épargne');
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
