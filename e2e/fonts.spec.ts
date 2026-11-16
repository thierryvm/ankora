import { test, expect, type Page } from '@playwright/test';

import fonts from '../scripts/fonts/fonts.json';

/**
 * Fonts as the browser actually loads them (lot A, ADR-049).
 *
 * From May to November 2026 production served a Fraunces file without a single
 * lowercase letter: every display heading silently fell back to Inter. Unit
 * tests (`scripts/fonts/__tests__/fonts.test.ts`) now hold the files to
 * `scripts/fonts/fonts.json`; this spec proves the browser side:
 *
 * - the head preloads exactly Inter latin, with `crossorigin` (without it a
 *   font preload is not reused and the file downloads twice). Fraunces is not
 *   preloaded: the LCP of `/` is the Inter intro paragraph, and preloading
 *   Fraunces measured slower (see `src/lib/fonts.tsx`);
 * - a French page never fetches a latin-ext file (the ranges are disjoint);
 * - the hero H1 really renders in Fraunces, measured glyph by glyph on a
 *   canvas: no glyph differs when Fraunces is unusable — so it can fail.
 *
 * `@playwright/test` directly, not the shared fixture: no state is installed.
 */

/** URL of an output by its stable name; the file name carries a content hash. */
function url(name: string): string {
  const output = fonts.outputs.find((o) => o.name === name);
  if (!output) throw new Error(`fonts.json has no output named ${name}`);
  return `/fonts/${output.file}`;
}

const LAYOUT_PRELOADS = [url('inter/inter-latin')];
/** The hero H1 is Fraunces and holds an italic `em`: both latin faces load on `/`. */
const LANDING_FONTS = [url('fraunces/fraunces-latin'), url('fraunces/fraunces-italic-latin')];

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
  test('the landing preloads Inter latin only, with crossorigin', async ({ page }) => {
    await page.goto('/');
    const preloads = await fontPreloads(page);
    expect(preloads.map((p) => p.href)).toEqual(LAYOUT_PRELOADS);
    for (const preload of preloads) {
      expect(preload.type, preload.href).toBe('font/woff2');
      expect(preload.crossorigin, preload.href).not.toBeNull();
    }
  });

  test('the landing loads the latin files and never a latin-ext file', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const requests = await fontRequests(page);
    for (const file of [...LAYOUT_PRELOADS, ...LANDING_FONTS]) {
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
    const widths = await h1.evaluate(async (element) => {
      const text = element.textContent ?? '';
      const style = getComputedStyle(element);
      const font = (family: string) => `${style.fontWeight} ${style.fontSize} ${family}`;
      // `document.fonts.ready` can settle before a swap face has even started
      // loading (seen on CI, mobile-chrome): ask for both faces explicitly. A
      // file that fails to load, or lacks these glyphs, leaves Fraunces unusable.
      await Promise.all(
        [font('Fraunces'), font('Inter')].map((f) => document.fonts.load(f, text).catch(() => [])),
      );
      const context = document.createElement('canvas').getContext('2d');
      if (!context) throw new Error('no 2d context');
      const measure = (family: string, glyphs: string) => {
        context.font = font(family);
        return context.measureText(glyphs).width;
      };
      // Compared glyph by glyph, never as one total: at 28 px the whole H1
      // happens to be almost as wide in Fraunces as in Inter (1 036 vs 1 030 px
      // locally, both rounding to 1 038 on CI's Linux), so a total proves
      // nothing. Per glyph, the two designs differ on most letters. If Fraunces
      // were missing or unusable, `Fraunces, Inter` would resolve to Inter for
      // every glyph and every difference below would be 0.
      const glyphs = [...new Set(text.replace(/\s/g, ''))];
      const differing = glyphs.filter(
        (glyph) => Math.abs(measure('Fraunces, Inter', glyph) - measure('Inter', glyph)) > 0.25,
      );
      return { glyphs: glyphs.length, differing: differing.length, family: style.fontFamily };
    });
    expect(widths.family).toMatch(/^"?Fraunces/);
    expect(widths.glyphs).toBeGreaterThan(10);
    // A real Fraunces differs from Inter on well over half the H1's letters.
    expect(widths.differing).toBeGreaterThan(widths.glyphs / 2);
  });

  test('another public page preloads only Inter and never fetches the italic', async ({ page }) => {
    await page.goto('/faq');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const preloads = await fontPreloads(page);
    expect(preloads.map((p) => p.href)).toEqual(LAYOUT_PRELOADS);
    const requests = await fontRequests(page);
    expect(requests).not.toContain(url('fraunces/fraunces-italic-latin'));
    expect(requests.filter((path) => path.includes('-latin-ext'))).toEqual([]);
  });
});
