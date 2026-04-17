import { test as base, expect } from '@playwright/test';

/**
 * Pre-seeds the consent banner as dismissed so tests can click through
 * without the fixed-position dialog intercepting pointer events. Matches
 * the storage contract in src/components/gdpr/ConsentBanner.tsx.
 */
export const test = base.extend({
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
