import { test, expect, type Page } from '@playwright/test';

/**
 * Fonts as the browser actually loads them (lot A, ADR-049).
 *
 * From May to November 2026 production served a Fraunces file without a single
 * lowercase letter: every display heading silently fell back to Inter. Unit
 * tests (`scripts/fonts/__tests__/fonts.test.ts`) now hold the files to
 * `scripts/fonts/fonts.json`; this spec proves the browser side:
 *
 * - the head preloads exactly the planned files, each with `crossorigin`
 *   (without it a font preload is not reused and the file downloads twice);
 * - a French page never fetches a latin-ext file (the ranges are disjoint);
 * - the hero H1 really renders in Fraunces, measured by a canvas comparison
 *   that is EQUAL when Fraunces is unusable — so it can fail.
 *
 * `@playwright/test` directly, not the shared fixture: no state is installed.
 */

const LAYOUT_PRELOADS = ['/fonts/inter/inter-latin.woff2'];
const LANDING_PRELOADS = [
  '/fonts/fraunces/fraunces-latin.woff2',
  '/fonts/fraunces/fraunces-italic-latin.woff2',
];

async function fontPreloads(page: Page) {
  return page.locator('head link[rel="preload"][as="font"]').evaluateAll((links) =>
    links.map((link) => ({
      href: new URL(link.getAttribute('href') ?? '', location.href).pathname,
      type: link.getAttribute('type'),
      crossorigin: link.getAttribute('crossorigin'),
    })),
  );
}

async function fontRequests(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => new URL(entry.name).pathname)
      .filter((path) => path.startsWith('/fonts/')),
  );
}

test.describe('Fonts — preload, coverage, rendering', () => {
  test('the landing preloads Inter latin and both Fraunces latin faces, with crossorigin', async ({
    page,
  }) => {
    await page.goto('/');
    const preloads = await fontPreloads(page);
    expect(preloads.map((p) => p.href).sort()).toEqual(
      [...LAYOUT_PRELOADS, ...LANDING_PRELOADS].sort(),
    );
    for (const preload of preloads) {
      expect(preload.type, preload.href).toBe('font/woff2');
      expect(preload.crossorigin, preload.href).not.toBeNull();
    }
  });

  test('the landing loads the latin files and never a latin-ext file', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const requests = await fontRequests(page);
    for (const file of [...LAYOUT_PRELOADS, ...LANDING_PRELOADS]) {
      expect(requests, file).toContain(file);
    }
    expect(requests.filter((path) => path.includes('-latin-ext'))).toEqual([]);

    const faces = await page.evaluate(() =>
      [...document.fonts].map((face) => ({
        family: face.family.replace(/["']/g, ''),
        style: face.style,
        range: face.unicodeRange,
        status: face.status,
      })),
    );
    // Browsers serialise U+0100-0130 as "U+100-130": the first latin-ext range.
    const latinExt = faces.filter((face) => /U\+0*100-0*130/i.test(face.range));
    expect(latinExt.length).toBeGreaterThan(0);
    for (const face of latinExt)
      expect(face.status, `${face.family} ${face.style}`).toBe('unloaded');
    for (const [family, style] of [
      ['Inter', 'normal'],
      ['Fraunces', 'normal'],
      ['Fraunces', 'italic'],
    ] as const) {
      const latin = faces.find(
        (face) =>
          face.family === family && face.style === style && /^U\+0*0-0*FF\b/i.test(face.range),
      );
      expect(latin?.status, `${family} ${style} latin`).toBe('loaded');
    }
  });

  test('the hero H1 renders in Fraunces, not in its Inter fallback', async ({ page }) => {
    await page.goto('/');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const widths = await h1.evaluate((element) => {
      const text = element.textContent ?? '';
      const style = getComputedStyle(element);
      const context = document.createElement('canvas').getContext('2d');
      if (!context) throw new Error('no 2d context');
      const measure = (family: string) => {
        context.font = `${style.fontWeight} ${style.fontSize} ${family}`;
        return context.measureText(text).width;
      };
      // If Fraunces were missing or unusable, the first stack would resolve to
      // Inter and both widths would be equal.
      return {
        fraunces: measure('Fraunces, Inter'),
        inter: measure('Inter'),
        family: style.fontFamily,
      };
    });
    expect(widths.family).toMatch(/^"?Fraunces/);
    expect(widths.fraunces).not.toBeCloseTo(widths.inter, 0);
  });

  test('another public page preloads only Inter and never fetches the italic', async ({ page }) => {
    await page.goto('/faq');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const preloads = await fontPreloads(page);
    expect(preloads.map((p) => p.href)).toEqual(LAYOUT_PRELOADS);
    const requests = await fontRequests(page);
    expect(requests).not.toContain('/fonts/fraunces/fraunces-italic-latin.woff2');
    expect(requests.filter((path) => path.includes('-latin-ext'))).toEqual([]);
  });
});
