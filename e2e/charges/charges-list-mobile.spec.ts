/**
 * Charges list — mobile layout (PR-BETA-1 THI-265).
 *
 * Verifies the refactored `/app/charges` list collapses into stacked cards on
 * viewports < 768px (forced 375×667 — iPhone SE class):
 *  - each charge becomes a bordered, padded card (rounded-lg border bg-card p-4)
 *  - delete button satisfies WCAG 2.5.5 minimum target size (≥ 44×44 CSS px)
 *  - no horizontal overflow on the list container
 *
 * Auth + seed pattern mirrored from e2e/dashboard-expenses.spec.ts.
 */

import { test, expect } from '../helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from '../helpers/seed';

const admin = adminClientOrNull();

test.describe('Charges list — mobile layout (PR-BETA-1)', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  // Force a sub-md viewport. Forces the mobile card stack regardless of the
  // Playwright project (chromium-desktop, mobile-safari, mobile-chrome).
  test.use({ viewport: { width: 375, height: 667 } });

  test('stacks charges as cards with WCAG-compliant 44px delete targets and no overflow', async ({
    page,
  }) => {
    if (!admin) return;
    const user = await seedOnboardedUser(admin, [
      {
        label: 'Loyer appartement',
        amount: 1200,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
      {
        label: 'Taxe voiture',
        amount: 300,
        frequency: 'annual',
        dueMonth: 6,
        paidFrom: 'principal',
      },
    ]);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      await page.goto('/fr-BE/app/charges');
      await expect(page.getByTestId('charges-list')).toBeVisible();

      const liRows = page.locator('ul[data-testid="charges-list"] > li');
      await expect(liRows).toHaveCount(2);

      const firstRow = liRows.first();

      // Mobile card visual: rounded border + non-transparent background.
      const cardStyles = await firstRow.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return {
          borderTopWidth: parseFloat(cs.borderTopWidth),
          borderRadius: parseFloat(cs.borderTopLeftRadius),
          padding: parseFloat(cs.paddingTop),
        };
      });
      expect(cardStyles.borderTopWidth, 'mobile card has a visible border').toBeGreaterThan(0);
      expect(cardStyles.borderRadius, 'mobile card is rounded').toBeGreaterThan(0);
      expect(cardStyles.padding, 'mobile card has internal padding').toBeGreaterThanOrEqual(12);

      // Delete button satisfies the WCAG 2.5.5 (Level AAA) minimum target size
      // of 44×44 CSS px — mandatory on touch (no hover affordance).
      const deleteBox = await firstRow.getByRole('button', { name: /^Supprimer / }).boundingBox();
      expect(deleteBox, 'delete button is rendered').not.toBeNull();
      expect(
        deleteBox!.width,
        `delete touch target width (${deleteBox!.width}px)`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        deleteBox!.height,
        `delete touch target height (${deleteBox!.height}px)`,
      ).toBeGreaterThanOrEqual(44);

      // No horizontal overflow: the list container fits within the viewport.
      const overflow = await page.evaluate(() => ({
        bodyScrollWidth: document.body.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.bodyScrollWidth - overflow.clientWidth,
        `no horizontal overflow on /app/charges (375px viewport)`,
      ).toBeLessThanOrEqual(1);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
