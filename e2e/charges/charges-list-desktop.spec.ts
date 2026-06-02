/**
 * Charges list — desktop layout (PR-BETA-1 THI-265).
 *
 * Verifies the refactored `/app/charges` list renders with the expected
 * grid structure on viewports ≥ 768px:
 *  - month, label, frequency chip and amount on a single baseline-aligned row
 *  - amount cell right-aligned within its grid cell
 *  - frequency chip never wraps (shrink-0)
 *
 * Mirrors the auth + seed pattern from `e2e/dashboard-expenses.spec.ts` —
 * skips gracefully when the env can't provide a real Supabase.
 */

import { test, expect } from '../helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from '../helpers/seed';

const admin = adminClientOrNull();

test.describe('Charges list — desktop layout (PR-BETA-1)', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  // Force a desktop-class viewport regardless of project (chromium-desktop,
  // mobile-safari, mobile-chrome all share the same e2e/ root); the only
  // assertion contract here is the ≥ md grid layout, so the viewport must be
  // explicitly desktop.
  test.use({ viewport: { width: 1280, height: 800 } });

  test('renders charges as a single-row grid with right-aligned amount and shrink-0 chip', async ({
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
      {
        label: 'Assurance habitation',
        amount: 480,
        frequency: 'annual',
        dueMonth: 3,
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

      // PR-UI-3a (THI-300): `charges-list` is now a wrapper of per-frequency
      // <section>s; the rows are descendant <li> (no longer direct children).
      const liRows = page.locator('[data-testid="charges-list"] li');
      await expect(liRows).toHaveCount(3);

      // Grouping: 1 monthly (Loyer) + 2 annual (Taxe, Assurance) → two sections,
      // each with a subtotal, plus the global total footer @thierry asked for.
      await expect(page.getByTestId('charges-group-monthly')).toBeVisible();
      await expect(page.getByTestId('charges-group-annual')).toBeVisible();
      await expect(page.getByTestId('charges-group-quarterly')).toHaveCount(0);
      await expect(page.getByTestId('charges-group-subtotal-monthly')).toBeVisible();
      await expect(page.getByTestId('charges-group-subtotal-annual')).toBeVisible();
      await expect(page.getByTestId('charges-total')).toBeVisible();

      const firstRow = liRows.first();

      // Structural contract — the 4 cells are present and resolvable by testid (order in DOM
      // reflects the markup: next-due + amount in the header wrapper, then label + frequency in
      // the body wrapper, both flattened on desktop via `md:contents`).
      const monthCell = firstRow.getByTestId('charges-row-next-due');
      const labelCell = firstRow.getByTestId('charges-row-label');
      const frequencyCell = firstRow.getByTestId('charges-row-frequency');
      const amountCell = firstRow.getByTestId('charges-row-amount');
      await expect(monthCell).toBeVisible();
      await expect(labelCell).toBeVisible();
      await expect(frequencyCell).toBeVisible();
      await expect(amountCell).toBeVisible();

      // Class layer — the layout primitives are present (md:items-baseline + amount text-right + chip shrink-0).
      await expect(firstRow).toHaveClass(/md:items-baseline/);
      await expect(amountCell).toHaveClass(/md:text-right/);
      await expect(amountCell).toHaveClass(/tabular-nums/);
      await expect(frequencyCell).toHaveClass(/shrink-0/);

      // Computed CSS layer — guarantees the classes actually apply at the forced 1280×800 viewport.
      const frequencyFlexShrink = await frequencyCell.evaluate(
        (el) => window.getComputedStyle(el as HTMLElement).flexShrink,
      );
      expect(frequencyFlexShrink, 'frequency chip is shrink: 0').toBe('0');

      // Geometry layer — defends against display:contents/grid-order regressions that classes alone
      // would not catch (e.g. items reordered but classes still present).
      const tops = await firstRow.evaluate((row) => {
        const cell = (selector: string) =>
          (row.querySelector(selector) as HTMLElement).getBoundingClientRect().bottom;
        return {
          month: cell('[data-testid="charges-row-next-due"]'),
          label: cell('[data-testid="charges-row-label"]'),
          freq: cell('[data-testid="charges-row-frequency"]'),
          amount: cell('[data-testid="charges-row-amount"]'),
        };
      });
      const spread =
        Math.max(tops.month, tops.label, tops.freq, tops.amount) -
        Math.min(tops.month, tops.label, tops.freq, tops.amount);
      expect(spread, `cells share a baseline (spread: ${spread}px)`).toBeLessThanOrEqual(6);

      // Amount cell visually positioned in the right half of the row (catches column-order regressions).
      const rowBox = await firstRow.boundingBox();
      expect(rowBox, 'row bounding box is rendered').not.toBeNull();
      const amountBox = await amountCell.boundingBox();
      expect(amountBox, 'amount cell bounding box is rendered').not.toBeNull();
      expect(amountBox!.x, 'amount cell sits in the right half of the row').toBeGreaterThan(
        rowBox!.x + rowBox!.width / 2,
      );
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
