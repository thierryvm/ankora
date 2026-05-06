import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

test.describe('PR-D3 — Bloc 2 hero radar (Effort Lissé + Capacité Réelle)', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  test('renders both hero cards on the dashboard for an authenticated user', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 900, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    // Configure income + daily allowance so the cards have non-trivial inputs.
    await admin
      .from('workspaces')
      .update({ monthly_income: 2500, vie_courante_monthly_transfer: 500 })
      .eq('id', user.workspaceId);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      await expect(page.getByTestId('effort-financier-card')).toBeVisible();
      await expect(page.getByTestId('capacite-epargne-card')).toBeVisible();
      // 2500 - 900 - 500 = 1100 → positive
      const card = page.getByTestId('capacite-epargne-card');
      await expect(card).toHaveAttribute('data-positive', 'true');
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('renders the negative variant in rose when charges exceed income', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      { label: 'Big bill', amount: 1500, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    await admin
      .from('workspaces')
      .update({ monthly_income: 1000, vie_courante_monthly_transfer: 0 })
      .eq('id', user.workspaceId);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      const card = page.getByTestId('capacite-epargne-card');
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute('data-positive', 'false');
      const value = page.getByTestId('capacite-epargne-value');
      // The value class string must include the rose accent.
      const className = await value.getAttribute('class');
      expect(className ?? '').toMatch(/rose/);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('renders the mini-CTA on daily_card when vie_courante_monthly_transfer is null', async ({
    page,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 800, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    // Income only — daily allowance left null on purpose.
    await admin
      .from('workspaces')
      .update({ monthly_income: 2000, vie_courante_monthly_transfer: null })
      .eq('id', user.workspaceId);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      // The CTA links to /app/accounts so the user can finish the cockpit
      // setup. Anchored to the daily_card row via the AccountCard data-attr.
      const dailyCard = page.locator('[data-account-type="daily_card"]');
      await expect(dailyCard).toBeVisible();
      const cta = dailyCard.getByRole('link', { name: /régler le plafond quotidien/i });
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', /\/app\/accounts/);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('Bloc 2 stays visible on iPhone viewport (mobile-first)', async ({ page }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 700, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
    await admin
      .from('workspaces')
      .update({ monthly_income: 2500, vie_courante_monthly_transfer: 400 })
      .eq('id', user.workspaceId);

    await page.setViewportSize({ width: 375, height: 667 });
    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      await expect(page.getByTestId('effort-financier-card')).toBeVisible();
      await expect(page.getByTestId('capacite-epargne-card')).toBeVisible();
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
