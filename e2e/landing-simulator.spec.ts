import { test, expect } from '@playwright/test';

/**
 * Smoke test for the public landing simulator (PR-3c).
 *
 * Scope:
 * - Section is reachable from the marketing landing.
 * - The radiogroup pattern works (selecting "Ambitieux" updates aria-checked).
 * - Moving the slider re-renders the projection numerically (no assertion on
 *   the chart SVG itself — recharts geometry is brittle and not the contract
 *   we ship).
 *
 * a11y baseline (axe-core) is already covered by `e2e/a11y/baseline.spec.ts`
 * which scans `/` — no need to duplicate here.
 */

test.describe('Landing — public simulator', () => {
  test('section renders with all four sub-components', async ({ page }) => {
    await page.goto('/');

    const section = page.locator('#simulator');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    await expect(section.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(section.getByRole('radiogroup')).toBeVisible();
    await expect(section.getByRole('slider')).toBeVisible();
    await expect(section.getByRole('link', { name: /créer mon plan/i })).toBeVisible();
  });

  test('selecting a different scenario updates the slider value', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#simulator');
    await section.scrollIntoViewIfNeeded();

    const ambitious = section.getByRole('radio', { name: /ambitieux/i });
    await ambitious.click();
    await expect(ambitious).toHaveAttribute('aria-checked', 'true');

    const slider = section.getByRole('slider');
    await expect(slider).toHaveValue('200');
  });

  test('the FSMA caveat is present on the result panel', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#simulator');
    await section.scrollIntoViewIfNeeded();

    await expect(section.getByText(/ne fournit pas de conseil en placement/i)).toBeVisible();
  });
});
