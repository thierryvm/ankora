import { test, expect } from '@playwright/test';

/**
 * Security headers contract for /[locale]/admin/* (PR-SEC-ADMIN).
 *
 * Defense-in-depth: even when @thierry's session is valid and requireAdmin()
 * returns the admin user, the route MUST send the right headers to prevent
 * indexing, caching, frame-embedding and Referer leakage. These tests pin
 * the contract so a future next.config.ts edit can't silently strip a
 * directive.
 *
 * The route returns a redirect (302 to /login) for an unauthenticated
 * client, but the headers we assert here are SET on the redirect response
 * itself by Next.js — the matcher in next.config.ts triggers before the
 * Server Component renders. So we can validate the contract without an
 * authenticated session.
 */

test.describe('/admin security headers (PR-SEC-ADMIN)', () => {
  for (const path of ['/fr-BE/admin', '/en/admin']) {
    test(`${path} sends X-Robots-Tag, Cache-Control, Referrer-Policy headers`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response, `expected a response for ${path}`).not.toBeNull();

      const headers = response!.headers();

      // X-Robots-Tag must include noindex + nofollow (case-insensitive)
      const robots = headers['x-robots-tag']?.toLowerCase() ?? '';
      expect(robots, 'X-Robots-Tag must declare noindex').toContain('noindex');
      expect(robots, 'X-Robots-Tag must declare nofollow').toContain('nofollow');

      // Cache-Control must prevent CDN + browser cache
      const cacheControl = headers['cache-control']?.toLowerCase() ?? '';
      expect(cacheControl, 'Cache-Control must include no-store').toContain('no-store');
      expect(cacheControl, 'Cache-Control must include private').toContain('private');

      // Referrer-Policy must NOT leak the admin URL to third parties
      const referrer = headers['referrer-policy']?.toLowerCase() ?? '';
      expect(referrer, 'Referrer-Policy must be same-origin (or stricter)').toMatch(
        /same-origin|no-referrer/,
      );
    });
  }
});
