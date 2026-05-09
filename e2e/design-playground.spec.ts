import { test, expect } from '@playwright/test';

/**
 * Smoke test for the internal design playground route.
 *
 * Goal: verify the route renders without crashing and that all 11 atoms
 * sections are visible. NOT a functional test of each atom — those are
 * covered by Vitest unit tests (~250 tests across 11 atoms).
 *
 * Webkit (mobile-safari, iPhone projects) is deliberately skipped:
 * - existing cookies-consent flake on webkit (#131)
 * - useTransition timing race risk in Drawer (Task 16 root cause investigation)
 * Reintegration planned in PR-D5 after fix.
 */

test.describe.configure({ mode: 'parallel' });

const PLAYGROUND_PATH = '/fr-BE/_design-playground';

const ATOM_SECTION_HEADINGS: ReadonlyArray<string> = [
  '01 — Button',
  '02 — Chip',
  '03 — Card',
  '04 — Drawer',
  '05 — ProgressBar',
  '06 — Avatar',
  '07 — ColorPicker',
  '08 — IconPicker',
  '09 — Tabs',
  '10 — ThemeToggle',
  '11 — LangSwitcher',
];

test.describe('Design playground smoke (PR-D4-PHASE2-A)', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'FIXME 2026-05-09 (PR-D4-PHASE2-A Task 15) — webkit skipped pending fix root cause Drawer + cookies-consent flake (cf. plan Task 16). Réintégrer en PR-D5.',
  );

  test('renders title and 11 atom sections without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto(PLAYGROUND_PATH);

    await expect(page.getByRole('heading', { name: 'Ankora Design Playground' })).toBeVisible();

    for (const heading of ATOM_SECTION_HEADINGS) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }

    expect(consoleErrors, `Console errors detected: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  });
});
