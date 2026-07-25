import { test, expect } from '@playwright/test';

test.describe('Security headers', () => {
  test('home sets strict CSP with nonce + strict-dynamic', async ({ page }) => {
    const response = await page.goto('/');
    const csp = response?.headers()['content-security-policy'];
    expect(csp, 'CSP header present').toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toMatch(/'nonce-[^']+'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test('style-src allow-lists no third-party style hash', async ({ page }) => {
    // Deliberate absence, not an oversight. Allow-listing the hash of the
    // <style> sonner injects at runtime would silence its two console
    // violations, but allowing a <style> also APPLIES it — and that copy is
    // unlayered, so it would outrank the layered `@import` in globals.css and
    // every Tailwind utility, painting a white toast in dark mode. The
    // stylesheet is served from 'self' instead. Cf. docs/prs/PR-csp-sonner-report.md.
    const response = await page.goto('/');
    const csp = response?.headers()['content-security-policy'] ?? '';
    const styleSrc = csp.split(';').find((d) => d.trim().startsWith('style-src')) ?? '';

    expect(styleSrc, 'style-src directive present').toBeTruthy();
    expect(styleSrc, 'no hash source may creep into style-src').not.toMatch(/'sha\d{3}-/);
    // `'unsafe-hashes'` only concerns inline `style=` attributes and must never
    // be needed here — the repo styles exclusively through classes.
    expect(styleSrc).not.toContain("'unsafe-hashes'");
  });

  test('baseline security headers applied', async ({ page }) => {
    const response = await page.goto('/');
    const h = response?.headers() ?? {};
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['permissions-policy']).toContain('camera=()');
  });

  test('robots disallows app & auth paths', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.status()).toBe(200);
    const body = (await response?.text()) ?? '';
    expect(body).toContain('Disallow: /app');
    expect(body).toContain('Disallow: /auth');
  });

  test('llms.txt served with LLM-friendly description', async ({ page }) => {
    const response = await page.goto('/llms.txt');
    expect(response?.status()).toBe(200);
    const body = (await response?.text()) ?? '';
    expect(body.toLowerCase()).toContain('ankora');
  });
});
