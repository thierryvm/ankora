import { test, expect, type Page } from '@playwright/test';

/**
 * Lot B — headings and increased contrast, measured in the rendered page.
 *
 * Measured on ankora.be on 15 November 2026: /login and /signup had no h1
 * (their first heading was the card's h3), and with `contrast: more` emulated
 * the landing header stayed 82 % translucent with its blur.
 *
 * Imports the BASE `test`, never the shared fixture: nothing here depends on
 * the consent banner, and the fixture's pre-seeded state is not a fact about
 * the world (CLAUDE.md, R#harnais). Public spec, no account.
 */

for (const [path, name] of [
  ['/login', 'Se connecter'],
  ['/signup', 'Créer mon cockpit'],
  ['/forgot-password', 'Mot de passe oublié'],
] as const) {
  test(`${path} has exactly one h1, and it names the page`, async ({ page }) => {
    await page.goto(path);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveAccessibleName(name);
    // No heading level is skipped before the first h1.
    const firstHeading = await page
      .locator('h1, h2, h3, h4, h5, h6')
      .first()
      .evaluate((el) => el.tagName);
    expect(firstHeading).toBe('H1');
  });
}

/** Computed backdrop-filter and background alpha of the landing header. */
async function header(page: Page): Promise<{ backdrop: string; alpha: number }> {
  const el = page.locator('header.surface-overlay');
  await expect(el).toHaveCount(1);
  return el.evaluate((node) => {
    const style = getComputedStyle(node);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const alpha = ctx.getImageData(0, 0, 1, 1).data[3]! / 255;
    const backdrop =
      style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter') || 'none';
    return { backdrop, alpha };
  });
}

test('the landing header turns opaque under increased contrast', async ({ page, browserName }) => {
  // `contrast` emulation is a Chromium capability; WebKit and Firefox ignore
  // it, which would make the second half pass or fail for the wrong reason.
  test.skip(browserName !== 'chromium', 'prefers-contrast emulation is Chromium-only');

  await page.goto('/');

  // Baseline FIRST: without it, a selector that matches nothing or an engine
  // without @supports would make the assertion below pass for free.
  const avant = await header(page);
  expect(avant.backdrop).not.toBe('none');
  expect(avant.alpha).toBeLessThan(1);

  await page.emulateMedia({ contrast: 'more' });
  const apres = await header(page);
  expect(apres.backdrop).toBe('none');
  expect(apres.alpha).toBe(1);
});

test('an active state keeps a visible outline in forced colours', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'forced-colors emulation is Chromium-only');

  await page.goto('/');
  // The simulator's scenario buttons carry their active state in a fill and
  // a border colour, both of which forced colours replace.
  const actif = page.locator('button[aria-pressed="true"]').first();
  await expect(actif).toHaveCount(1);
  const contour = () =>
    actif.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, offset: s.outlineOffset };
    });

  // Baseline: no outline at rest, so the one below is the media query's.
  expect((await contour()).style).toBe('none');

  await page.emulateMedia({ forcedColors: 'active' });
  expect(await contour()).toEqual({ style: 'solid', offset: '-2px' });
});
