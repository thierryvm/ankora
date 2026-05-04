/**
 * dashboard.spec.ts — Sprint Mobile Recovery PR-QA-1b
 *
 * Audits the authenticated /app dashboard on iPhone Safari WebKit. Documents
 * the "cards Dashboard coupées à droite" bug observed on iPhone 14 by
 * @thierry on 2026-05-04. All tests need a real Supabase backend
 * (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) and skip otherwise.
 */

import { test, expect } from './fixtures/mobile-test';
import { seedUserWithCharges, deleteSeededUser } from './fixtures/mobile-test';

test.describe('Dashboard — iPhone Safari WebKit (PR-QA-1b)', () => {
  test('no horizontal overflow on /app', async ({ page, admin }) => {
    test.skip(!admin, 'Needs real Supabase.');
    if (!admin) return;

    const user = await seedUserWithCharges(admin, [
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
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => ({
        bodyScrollWidth: document.body.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(
        overflow.bodyScrollWidth - overflow.clientWidth,
        `body.scrollWidth=${overflow.bodyScrollWidth} > clientWidth=${overflow.clientWidth} — horizontal overflow on /app (this is the @thierry-2026-05-04 "cards coupées" bug)`,
      ).toBeLessThanOrEqual(1);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('typed account cards: each card fits within the viewport (no right-edge clipping)', async ({
    page,
    admin,
  }) => {
    test.skip(!admin, 'Needs real Supabase.');
    if (!admin) return;

    const user = await seedUserWithCharges(admin, [
      {
        label: 'Loyer',
        amount: 800,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
      {
        label: 'Assurance auto',
        amount: 600,
        frequency: 'annual',
        dueMonth: 6,
        paidFrom: 'epargne',
      },
    ]);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });
      await page.waitForLoadState('networkidle');

      // The dashboard exposes account cards via [data-account-type] (cf.
      // dashboard-account-rename.spec.ts).
      const cards = page.locator('[data-account-type]');
      const count = await cards.count();
      expect(count, 'Expected at least 1 typed account card').toBeGreaterThan(0);

      const overflowing = await cards.evaluateAll((els) => {
        const clientWidth = document.documentElement.clientWidth;
        return els
          .map((el, i) => {
            const rect = el.getBoundingClientRect();
            return {
              index: i,
              type: el.getAttribute('data-account-type'),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              clientWidth,
              overflows: rect.right > clientWidth + 1,
            };
          })
          .filter((c) => c.overflows);
      });

      expect(
        overflowing,
        `Account cards clipped on the right edge: ${JSON.stringify(overflowing)}`,
      ).toEqual([]);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('rename: pencil edit affordance is visible (opacity ≥ 0.3)', async ({ page, admin }) => {
    test.skip(!admin, 'Needs real Supabase.');
    if (!admin) return;

    const user = await seedUserWithCharges(admin, [
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

      // The pencil affordance is inside the "Renommer le compte" button
      // (cf. dashboard-account-rename.spec.ts pattern).
      const renameButton = page
        .locator('[data-account-type="income_bills"]')
        .getByRole('button', { name: /Renommer le compte/i });
      await expect(renameButton).toBeVisible();

      // The svg pencil inside has its own opacity. We check the icon (svg)
      // descendant of the button.
      const opacity = await renameButton.evaluate((btn) => {
        const svg = btn.querySelector('svg');
        if (!svg) return 1;
        return parseFloat(window.getComputedStyle(svg).opacity);
      });
      expect(
        opacity,
        `Pencil icon opacity is ${opacity} — must be ≥ 0.3 to be discoverable on mobile (no hover on touch)`,
      ).toBeGreaterThanOrEqual(0.3);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('rename: tap title → input appears, type → Enter persists across reload', async ({
    page,
    admin,
  }) => {
    test.skip(!admin, 'Needs real Supabase.');
    if (!admin) return;

    const user = await seedUserWithCharges(admin, [
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

      const card = page.locator('[data-account-type="income_bills"]');
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: /Renommer le compte/i }).click();
      const input = card.getByRole('textbox');
      await expect(input).toBeFocused();
      await input.fill('iPhone test');
      await input.press('Enter');

      await expect(
        card.getByRole('button', { name: /Renommer le compte « iPhone test »/i }),
      ).toBeVisible();

      await page.reload();
      await expect(
        page.locator('[data-account-type="income_bills"]').getByRole('button', {
          name: /Renommer le compte « iPhone test »/i,
        }),
      ).toBeVisible();
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
