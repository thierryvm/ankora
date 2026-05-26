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

      // PR-BETA-3 — the PR-D3-bis waterfall was replaced by the explicit
      // tryptique (ADR-009 amendement 2026-05-09). Assert the 3 sub-stats
      // render with their localised labels.
      const substats = page.getByTestId('capacite-epargne-substats');
      await expect(substats).toBeVisible();
      await expect(substats).toContainText('Reste disponible');
      await expect(substats).toContainText('Reste à vivre');
      await expect(substats).toContainText('Capacité épargne');
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('PR-D3-bis layout — accounts (réalité) appear before plan (action) in the DOM', async ({
    page,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 800, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
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

      // Both sections must exist…
      const accountsSection = page.locator('section[aria-labelledby="accounts-heading"]');
      const planSection = page.locator('section[aria-labelledby="plan-heading"]');
      await expect(accountsSection).toBeVisible();
      await expect(planSection).toBeVisible();

      // …and accounts must come BEFORE plan in document order so the user
      // first sees "where I stand" and only then "what to do" (handoff F3).
      const accountsBox = await accountsSection.boundingBox();
      const planBox = await planSection.boundingBox();
      expect(accountsBox).not.toBeNull();
      expect(planBox).not.toBeNull();
      if (accountsBox && planBox) {
        expect(accountsBox.y).toBeLessThan(planBox.y);
      }
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('PR-D3-bis cleanup — legacy KPI cards are gone (no provisions/health/bills tiles above the radar)', async ({
    page,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      { label: 'Loyer', amount: 800, frequency: 'monthly', dueMonth: 1, paidFrom: 'principal' },
    ]);
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

      // The four legacy headings disappeared with PR-D3-bis. They duplicated
      // the Bloc 2 breakdown (provisions+bills = effort lissé) and shipped
      // a context-free "Critique" badge that PR-D5 will reintroduce
      // properly with the rattrapage plan.
      await expect(page.getByText(/^Provisions \/ mois$/i)).toHaveCount(0);
      await expect(page.getByText(/^Santé provisions$/i)).toHaveCount(0);
      await expect(page.getByText(/^Virement suggéré$/i)).toHaveCount(0);
      await expect(page.getByText(/^Factures /i)).toHaveCount(0);
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
      // PR-D5 (2026-05-17) migrated `rose-*` raw Tailwind colours to the
      // semantic `text-danger` token. PR-BETA-3 keeps this contract.
      const className = await value.getAttribute('class');
      expect(className ?? '').toMatch(/text-danger/);
      expect(className ?? '').not.toMatch(/rose/);
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
