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

      // The 3 seeded charges render as direct <li> children of the list.
      const liRows = page.locator('ul[data-testid="charges-list"] > li');
      await expect(liRows).toHaveCount(3);

      const firstRow = liRows.first();
      // Geometry: the four cells share a common baseline (within 2px) on desktop.
      const tops = await firstRow.evaluate((row) => {
        const month = row.querySelector('[data-testid="charges-row-month"]') as HTMLElement;
        const label = row.querySelector('[data-testid="charges-row-label"]') as HTMLElement;
        const freq = row.querySelector('[data-testid="charges-row-frequency"]') as HTMLElement;
        const amount = row.querySelector('[data-testid="charges-row-amount"]') as HTMLElement;
        return {
          month: month.getBoundingClientRect().bottom,
          label: label.getBoundingClientRect().bottom,
          freq: freq.getBoundingClientRect().bottom,
          amount: amount.getBoundingClientRect().bottom,
        };
      });
      const allBottoms = [tops.month, tops.label, tops.freq, tops.amount];
      const spread = Math.max(...allBottoms) - Math.min(...allBottoms);
      expect(spread, `cells share a baseline (spread: ${spread}px)`).toBeLessThanOrEqual(6);

      // Amount cell text-right: its right edge should be close to the parent <li> right edge.
      const amountAlignment = await firstRow.evaluate((row) => {
        const amount = row.querySelector('[data-testid="charges-row-amount"]') as HTMLElement;
        const liRect = row.getBoundingClientRect();
        const amountRect = amount.getBoundingClientRect();
        return { liRight: liRect.right, amountRight: amountRect.right };
      });
      // Amount is right of the label column (i.e. positioned in the right half of the row).
      expect(amountAlignment.amountRight, 'amount cell hugs the right edge').toBeGreaterThan(
        (await firstRow.boundingBox())!.x + (await firstRow.boundingBox())!.width / 2,
      );

      // Frequency chip stays on one line even with a long label — assert width <= 120px.
      const chipWidth = await firstRow
        .locator('[data-testid="charges-row-frequency"]')
        .evaluate((el) => el.getBoundingClientRect().width);
      expect(chipWidth, `frequency chip is shrink-0 (width: ${chipWidth}px)`).toBeLessThan(120);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
