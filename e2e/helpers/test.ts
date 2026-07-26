import { test as base, expect } from '@playwright/test';

/**
 * Per-test client IP, so each test gets its own rate-limit bucket.
 *
 * `rateLimit('auth', …)` allows 5 attempts per 15 minutes keyed by IP
 * (`src/lib/security/rate-limit.ts`, `src/lib/actions/auth.ts`). A full suite
 * performs well over a hundred real logins — 39 `goto('/login')` call sites, and
 * the mobile-ios specs run on three iPhone projects each. From a single address
 * the suite locks itself out, and the failure surfaces as « Service
 * temporairement indisponible », which reads like a broken app rather than a
 * test-harness problem.
 *
 * The app derives the caller's IP from the client-supplied `x-forwarded-for`
 * header (`auth.ts:24`, `consent.ts:18`, `reste-a-vivre.ts:17`, `settings.ts:23`,
 * `require-admin.ts:37`, `rate-limit.ts:128`). Handing each test a distinct value
 * isolates the buckets without touching a single line of production code, and
 * adds no production risk: Vercel overwrites this header upstream.
 *
 * `extraHTTPHeaders` applies at BrowserContext level, so it covers navigations,
 * RSC fetches and Server Action POSTs alike — verified before this was written.
 */
let ipCounter = 0;

function nextTestIp(): string {
  ipCounter += 1;
  // 10.0.0.0/8 is private and never routable; two octets carry 65k tests, far
  // beyond any run.
  const high = Math.floor(ipCounter / 256) % 256;
  const low = ipCounter % 256;
  return `10.42.${high}.${low}`;
}

/**
 * Pre-seeds the consent banner as dismissed so tests can click through
 * without the fixed-position dialog intercepting pointer events. Matches
 * the storage contract in src/components/gdpr/ConsentBanner.tsx.
 */
export const test = base.extend<{ clientIp: string }>({
  clientIp: async ({}, run) => {
    await run(nextTestIp());
  },

  extraHTTPHeaders: async ({ clientIp }, run) => {
    await run({ 'x-forwarded-for': clientIp });
  },

  page: async ({ page }, run) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'ankora.consent.v1',
          JSON.stringify({
            version: '1.0.0',
            analytics: false,
            marketing: false,
            decidedAt: new Date().toISOString(),
          }),
        );
      } catch {
        // localStorage unavailable (e.g. private mode) — tests that need it will fail loudly.
      }
    });
    await run(page);
  },
});

export { expect };
