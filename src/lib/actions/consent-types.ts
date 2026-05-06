/**
 * Pure types and constants for the cookie consent flow. Lives in its own
 * file so `consent.ts` (which carries the `'use server'` directive) can
 * stay strictly async-export-only as enforced by `scripts/lint-use-server.mjs`.
 */

export const COOKIE_CONSENT_VERSION = '1.0.0';

export type CookieConsentInput = {
  analytics: boolean;
  marketing: boolean;
};

export type CookieConsentSnapshot = {
  analytics: boolean;
  marketing: boolean;
  version: string | null;
  decidedAt: string | null;
};
