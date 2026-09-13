import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The public home page sends a signed-in visitor to the cockpit.
 *
 * Reported from a real session: opening ankora.be while signed in landed on
 * the marketing page, and reaching the cockpit took one more tap on every
 * visit. The guard itself is `redirectIfSignedIn()` — already used by /login
 * and /signup, and tested in `src/lib/auth/__tests__/require-user-redirects`.
 * What this file pins is the WIRING: the page calls it, before it builds
 * anything, and lets its redirect through.
 *
 * The end-to-end proof that the browser really ends on /app, through a server
 * redirect and not a client-side refresh, lives in
 * `e2e/connected-landing-redirect.spec.ts`. That the anonymous visitor still
 * sees the marketing page is proven by `e2e/landing-sections.spec.ts`, which
 * runs without any session.
 */

const { redirectIfSignedInSpy, getTranslationsSpy, getNonceSpy } = vi.hoisted(() => ({
  redirectIfSignedInSpy: vi.fn(async (): Promise<void> => undefined),
  getTranslationsSpy: vi.fn(async () => (key: string) => key),
  getNonceSpy: vi.fn(async () => 'nonce'),
}));

vi.mock('@/lib/auth/require-user', () => ({ redirectIfSignedIn: redirectIfSignedInSpy }));
vi.mock('next-intl/server', () => ({ getTranslations: getTranslationsSpy }));
vi.mock('@/lib/security/nonce', () => ({ getNonce: getNonceSpy }));

// The sections are server components with their own data needs; none of them
// is under test here, and rendering them would only couple this file to them.
vi.mock('@/components/marketing/landing/sections/FAQ', () => ({
  FAQ: () => null,
  FAQ_KEYS: ['sample'],
}));
vi.mock('@/components/marketing/landing/sections/Feature', () => ({ Feature: () => null }));
vi.mock('@/components/marketing/landing/sections/FooterCTA', () => ({ FooterCTA: () => null }));
vi.mock('@/components/marketing/landing/sections/Hero', () => ({ Hero: () => null }));
vi.mock('@/components/marketing/landing/sections/MktFooter', () => ({ MktFooter: () => null }));
vi.mock('@/components/marketing/landing/sections/MktNav', () => ({ MktNav: () => null }));
vi.mock('@/components/marketing/landing/sections/Principles', () => ({ Principles: () => null }));
vi.mock('@/components/marketing/landing/sections/WhatIfDemo', () => ({ WhatIfDemo: () => null }));

import HomePage from '../page';

const params = Promise.resolve({ locale: 'fr-BE' });

describe('public home page — a signed-in visitor goes to the cockpit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    redirectIfSignedInSpy.mockResolvedValue(undefined);
    getTranslationsSpy.mockResolvedValue((key: string) => key);
    getNonceSpy.mockResolvedValue('nonce');
  });

  it('lets the redirect through, before preparing anything of the page', async () => {
    // Next's `redirect()` works by throwing; the page must not swallow it.
    const redirectSignal = new Error('NEXT_REDIRECT');
    redirectIfSignedInSpy.mockRejectedValue(redirectSignal);

    await expect(HomePage({ params } as never)).rejects.toBe(redirectSignal);
    expect(redirectIfSignedInSpy).toHaveBeenCalledTimes(1);
    // Nothing of the marketing page is built for someone who is leaving it.
    expect(getTranslationsSpy).not.toHaveBeenCalled();
    expect(getNonceSpy).not.toHaveBeenCalled();
  });

  it('renders the marketing page when the guard lets the visitor stay', async () => {
    const page = await HomePage({ params } as never);

    expect(redirectIfSignedInSpy).toHaveBeenCalledTimes(1);
    expect(page).not.toBeNull();
    expect(getTranslationsSpy).toHaveBeenCalled();
  });
});
