/**
 * pwa-install.spec.ts — Sprint Mobile Recovery PR-QA-1b
 *
 * Audits the PWA Add-to-Home-Screen surface on iPhone Safari WebKit:
 * manifest validity, apple-touch-icon presence + size, viewport-fit, and
 * theme-color coherence. These are detectable via DOM/network assertions
 * without actually triggering the iOS install flow (which requires Safari
 * UI clicks the Web Inspector cannot script).
 */

import { test, expect } from './fixtures/mobile-test';

test.describe('PWA install surface — iPhone Safari WebKit (PR-QA-1b)', () => {
  test('manifest: declares display=standalone + start_url + theme/background colors', async ({
    page,
    request,
  }) => {
    await page.goto('/');

    // Find the manifest link in the head.
    const manifestHref = await page.evaluate(() => {
      return document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null;
    });
    expect(manifestHref, 'No <link rel="manifest"> in head').toBeTruthy();

    // Fetch and parse the manifest.
    const url = new URL(manifestHref!, page.url()).toString();
    const response = await request.get(url);
    expect(response.ok(), `Manifest fetch failed (HTTP ${response.status()})`).toBeTruthy();
    const manifest = (await response.json()) as Record<string, unknown>;

    expect(manifest.display, `display=${manifest.display}, expected "standalone"`).toBe(
      'standalone',
    );
    expect(manifest.start_url, 'start_url missing').toBeTruthy();
    expect(manifest.theme_color, 'theme_color missing').toBeTruthy();
    expect(manifest.background_color, 'background_color missing').toBeTruthy();
    expect(manifest.name, 'name missing').toBeTruthy();
    expect(manifest.icons, 'icons[] missing').toBeTruthy();
    expect(Array.isArray(manifest.icons), 'icons must be an array').toBeTruthy();
    expect((manifest.icons as Array<unknown>).length).toBeGreaterThan(0);
  });

  test('apple-touch-icon: present in head and resolves to a 180×180+ image', async ({
    page,
    request,
  }) => {
    await page.goto('/');

    const appleTouchIconHref = await page.evaluate(() => {
      // iOS prioritises rel="apple-touch-icon" (no -precomposed).
      const link = document.querySelector('link[rel="apple-touch-icon"]');
      return link?.getAttribute('href') ?? null;
    });
    expect(appleTouchIconHref, 'No <link rel="apple-touch-icon"> in head').toBeTruthy();

    const iconUrl = new URL(appleTouchIconHref!, page.url()).toString();
    const response = await request.get(iconUrl);
    expect(
      response.ok(),
      `apple-touch-icon fetch failed (HTTP ${response.status()}) at ${iconUrl}`,
    ).toBeTruthy();

    // Decode the image to read its actual dimensions.
    const buffer = await response.body();
    const dimensions = await page.evaluate(async (b64) => {
      const img = new Image();
      const blob = await fetch(`data:image/png;base64,${b64}`).then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      try {
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error('decode failed'));
          img.src = url;
        });
        return { w: img.naturalWidth, h: img.naturalHeight };
      } finally {
        URL.revokeObjectURL(url);
      }
    }, buffer.toString('base64'));

    expect(
      dimensions.w,
      `apple-touch-icon is ${dimensions.w}×${dimensions.h} px — must be ≥ 180×180 for crisp iPhone home screen`,
    ).toBeGreaterThanOrEqual(180);
    expect(dimensions.h).toBeGreaterThanOrEqual(180);
  });

  test('apple-mobile-web-app-capable: meta tag = "yes"', async ({ page }) => {
    await page.goto('/');
    const value = await page.evaluate(
      () =>
        document
          .querySelector('meta[name="apple-mobile-web-app-capable"]')
          ?.getAttribute('content') ?? null,
    );
    // Apple has deprecated this in favor of mobile-web-app-capable, but
    // older iOS versions still rely on it. We accept either.
    const fallback = await page.evaluate(
      () =>
        document.querySelector('meta[name="mobile-web-app-capable"]')?.getAttribute('content') ??
        null,
    );
    expect(
      value === 'yes' || fallback === 'yes',
      `Neither apple-mobile-web-app-capable nor mobile-web-app-capable = "yes" (apple=${value}, mobile=${fallback}) — Add-to-Home-Screen will open in Safari chrome instead of standalone`,
    ).toBeTruthy();
  });

  test('theme-color: meta tag present and matches a non-empty token', async ({ page }) => {
    await page.goto('/');
    const themeColor = await page.evaluate(() => {
      const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
      return metas.map((m) => ({
        content: m.getAttribute('content'),
        media: m.getAttribute('media'),
      }));
    });
    expect(themeColor.length, 'No <meta name="theme-color"> in head').toBeGreaterThan(0);
    for (const tc of themeColor) {
      expect(tc.content, 'theme-color content empty').toBeTruthy();
      // Reject obvious wrongs (default browser white, default Vercel black).
      expect(tc.content?.toLowerCase()).not.toBe('#ffffff');
      expect(tc.content?.toLowerCase()).not.toBe('#fff');
      expect(tc.content?.toLowerCase()).not.toBe('#000000');
      expect(tc.content?.toLowerCase()).not.toBe('#000');
    }
  });

  test('viewport: contains viewport-fit=cover (already covered in landing.spec but re-asserted here)', async ({
    page,
  }) => {
    await page.goto('/');
    const viewport = await page.evaluate(
      () => document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
    );
    expect(viewport).toMatch(/viewport-fit\s*=\s*cover/);
  });
});
