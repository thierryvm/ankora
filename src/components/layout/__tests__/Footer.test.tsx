import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns = (messages as Record<string, Record<string, unknown>>)[namespace] ?? {};
    return (key: string, params?: Record<string, unknown>) => {
      const parts = key.split('.');
      let value: unknown = ns;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof value === 'string' && params) {
        return Object.entries(params).reduce(
          (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
          value,
        );
      }
      return typeof value === 'string' ? value : key;
    };
  },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// CookiePreferencesLink is a Client Component using `useTranslations` from
// `next-intl` (the client-side hook, distinct from the server `getTranslations`
// already mocked above). Stub it locally so the Footer test stays focused on
// the Server Component layout under test.
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const ns = (messages as Record<string, Record<string, unknown>>)[namespace] ?? {};
    const value = ns[key];
    return typeof value === 'string' ? value : key;
  },
}));

// CookiePreferencesLink imports ConsentBanner which transitively imports the
// `'use server'` consent action and the Supabase server client. Stub the
// action so importing the Footer doesn't initialise the env-validated
// Supabase client during the test run.
vi.mock('@/lib/actions/consent', () => ({
  recordCookieConsentAction: vi.fn().mockResolvedValue({ ok: true, data: { persisted: false } }),
  getCookieConsentAction: vi.fn().mockResolvedValue({ ok: true, data: { snapshot: null } }),
  resetCookieConsentAction: vi.fn().mockResolvedValue({ ok: true, data: { persisted: false } }),
  COOKIE_CONSENT_VERSION: '1.0.0',
}));

// PR-BETA-6 hotfix #4 — Footer hides its `<nav>` on mobile when the
// persistent BottomTabBar is mounted (the bar's More sheet already
// surfaces those links — see MoreSheet.tsx). Mock the state helper so
// each spec controls the visibility deterministically.
const bottomTabBarMountedRef = { value: false };
vi.mock('@/lib/layout/bottom-tab-bar-state', () => ({
  shouldMountBottomTabBar: async () => bottomTabBarMountedRef.value,
}));

function setBottomTabBarMounted(value: boolean): void {
  bottomTabBarMountedRef.value = value;
}

import { Footer } from '../Footer';

async function renderFooter() {
  const ui = await Footer();
  return render(ui);
}

describe('<Footer />', () => {
  beforeEach(() => {
    setBottomTabBarMounted(false);
  });

  it('renders the four legal links (CGU, Privacy, Cookies, FAQ)', async () => {
    await renderFooter();
    // Footer-specific link labels come from the `footer` namespace
    const cgu = screen.getByRole('link', { name: messages.footer.cgu });
    const privacy = screen.getByRole('link', { name: messages.footer.privacy });
    const cookies = screen.getByRole('link', { name: messages.footer.cookies });
    const faq = screen.getByRole('link', { name: messages.footer.faq });

    expect(cgu).toHaveAttribute('href', '/legal/cgu');
    expect(privacy).toHaveAttribute('href', '/legal/privacy');
    expect(cookies).toHaveAttribute('href', '/legal/cookies');
    expect(faq).toHaveAttribute('href', '/faq');
  });

  it('renders the copyright with the current year interpolated', async () => {
    await renderFooter();
    const year = new Date().getFullYear();
    // copyrightNotice template contains "{year}" — assert the resolved value appears
    expect(screen.getByText((content) => content.includes(String(year)))).toBeInTheDocument();
  });

  it('exposes the AnkoraLogo behind a single Accueil Ankora link (a11y, Sourcery #119 followup)', async () => {
    await renderFooter();
    // Post-refactor: the SVG is aria-hidden so SR users hear the wrapping
    // Link's aria-label exactly once. The brand mark itself is no longer
    // a separate role=img landmark.
    const homeLink = screen.getByLabelText(messages.common.homeAria);
    expect(homeLink).toHaveAttribute('href', '/');
    expect(screen.queryByRole('img', { name: 'Ankora' })).not.toBeInTheDocument();
  });

  it('uses an aria-labelled <nav> for the legal navigation', async () => {
    await renderFooter();
    const nav = screen.getByRole('navigation', { name: messages.common.nav.footerLabel });
    expect(nav).toBeInTheDocument();
  });

  it('exposes the cookie preferences re-open button (RGPD art. 7(3))', async () => {
    await renderFooter();
    expect(
      screen.getByRole('button', { name: messages.footer.cookiePreferences }),
    ).toBeInTheDocument();
  });

  // PR-BETA-6 hotfix #4 (THI-277, 2026-05-25, @thierry iPhone smoke): the
  // footer's link nav is fully redundant with the BottomTabBar More sheet
  // once the bar is mounted (same five entries — CGU, Privacy, Cookies,
  // FAQ, Cookie Preferences). Hide the nav on mobile when the bar is
  // mounted; keep it on desktop (≥ md) because the bar is `md:hidden`.
  describe('Hotfix #4 — redundant nav hidden on mobile when BottomTabBar mounts', () => {
    it('renders the nav with `flex` (visible on every breakpoint) by default', async () => {
      setBottomTabBarMounted(false);
      await renderFooter();
      const nav = screen.getByTestId('footer-nav');
      expect(nav.className).toContain('flex');
      expect(nav.className).not.toContain('hidden');
    });

    it('hides the nav on mobile (`hidden md:flex`) when the bar is mounted', async () => {
      setBottomTabBarMounted(true);
      await renderFooter();
      const nav = screen.getByTestId('footer-nav');
      expect(nav.className).toContain('hidden');
      expect(nav.className).toContain('md:flex');
    });

    it('always keeps the BrandHomeLink + copyright (never hidden, legal info)', async () => {
      setBottomTabBarMounted(true);
      await renderFooter();
      expect(screen.getByLabelText(messages.common.homeAria)).toBeInTheDocument();
      const year = new Date().getFullYear();
      expect(screen.getByText((c) => c.includes(String(year)))).toBeInTheDocument();
    });
  });
});
