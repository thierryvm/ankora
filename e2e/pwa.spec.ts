import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { test, expect } from '@playwright/test';

/** The worker's own caching allowlist, read from the shipped file. */
function cacheableAsset(): RegExp {
  const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
  const m = sw.match(/const CACHEABLE_ASSET =\s*\/([\s\S]*?)\/;/);
  if (!m) throw new Error('sw.js: CACHEABLE_ASSET literal not found');
  return new RegExp(m[1]!);
}

test.describe('PWA — service worker (lot P3)', () => {
  // The worker registers only under `next start` (ServiceWorkerRegister.tsx).
  // CI always runs the production server, so this never skips there: a
  // missing registration fails the test instead of hiding.
  test.skip(
    !process.env.CI && process.env.E2E_PROD_SERVER !== '1',
    'the service worker registers only under the production server',
  );

  test('enables navigation preload, and a navigation to /app caches no page', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Playwright WebKit is not iOS standalone; WebKit is covered by feature detection and the device pass',
    );

    await page.goto('/login');
    // `ready` resolves while the worker is still `activating`: the enable()
    // inside activate's waitUntil may not have run yet, so poll the state.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const reg = await navigator.serviceWorker.ready;
            return reg.navigationPreload ? reg.navigationPreload.getState() : 'unsupported';
          }),
        { timeout: 15_000 },
      )
      .toEqual({ enabled: true, headerValue: 'true' });

    await page.reload();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    // Unauthenticated: the proxy redirects /app to the login page.
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);

    const keys = await page.evaluate(async () => {
      const out: string[] = [];
      for (const name of await caches.keys())
        for (const req of await (await caches.open(name)).keys())
          out.push(new URL(req.url).pathname);
      return out;
    });
    expect(keys.length).toBeGreaterThan(0);
    const allowed = cacheableAsset();
    for (const path of keys) {
      // A fixed check that does not trust the allowlist itself.
      expect(path, `a page was cached: ${path}`).not.toMatch(
        /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(?:app|login)(?:\/|$)|^\/$/,
      );
      expect(path === '/offline' || allowed.test(path), `not an allowlisted asset: ${path}`).toBe(
        true,
      );
    }
  });
});

test.describe('PWA', () => {
  test('manifest.webmanifest is served with correct metadata', async ({ page }) => {
    const response = await page.goto('/manifest.webmanifest');
    expect(response?.status()).toBe(200);
    const body = await response?.json();
    expect(body.name).toMatch(/ankora/i);
    expect(body.display).toBe('standalone');
    expect(Array.isArray(body.icons)).toBe(true);
    expect(body.icons.length).toBeGreaterThanOrEqual(1);
  });

  test('offline fallback page is reachable directly', async ({ page }) => {
    const response = await page.goto('/offline');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /hors-ligne/i })).toBeVisible();
  });

  test('icon endpoints respond', async ({ request }) => {
    const svg = await request.get('/icon.svg');
    expect(svg.status()).toBe(200);
    // apple-icon.svg lives in /public (Next.js App Router only serves
    // apple-icon.(jpg|jpeg|png) via file-based metadata routes, not SVG).
    const apple = await request.get('/apple-icon.svg');
    expect(apple.status()).toBe(200);
  });
});
