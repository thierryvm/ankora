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

      // PR-UI-3a (THI-300): rows are descendant <li> of the grouped sections.
      const liRows = page.locator('[data-testid="charges-list"] li');
      await expect(liRows).toHaveCount(2);

      const firstRow = liRows.first();

      // PR-UI-3a flatten: the mobile cards (rounded-lg border bg-card p-4) were
      // replaced by plain divided lines so the list reads as one column instead
      // of fragmented cards. Assert the card chrome is GONE and the row sits in a
      // `divide-y` group list.
      await expect(firstRow).not.toHaveClass(/rounded-lg/);
      await expect(firstRow).not.toHaveClass(/bg-card/);
      await expect(firstRow).not.toHaveClass(/\bp-4\b/);
      const groupList = firstRow.locator('xpath=ancestor::ul[1]');
      await expect(groupList).toHaveClass(/divide-y/);

      // The global total footer is the headline @thierry asked for.
      await expect(page.getByTestId('charges-total')).toBeVisible();

      // Delete button — semantic class layer asserts the 44×44 touch target contract via `size-11`
      // (the Button component's icon size). A single geometric backup catches breakage if the
      // utility is overridden inline (defense in depth, kept light to avoid font-metric coupling).
      const deleteButton = firstRow.getByRole('button', { name: /^Supprimer / });
      await expect(deleteButton).toHaveClass(/size-11/);
      const deleteBox = await deleteButton.boundingBox();
      expect(deleteBox, 'delete button bounding box is rendered').not.toBeNull();
      expect(
        Math.min(deleteBox!.width, deleteBox!.height),
        `delete touch target is at least 44×44 CSS px (got ${deleteBox!.width}×${deleteBox!.height})`,
      ).toBeGreaterThanOrEqual(44);

      // No horizontal overflow at the document level — a mobile card miss with `pr-14` overshoot
      // would leak into <body> scrollWidth and break swipe scroll. Stays at document level rather
      // than scoped to <ul> because the original prod bug (smoke test 24/05) was full-page overflow.
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
