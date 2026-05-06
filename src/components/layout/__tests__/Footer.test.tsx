import { describe, it, expect, vi } from 'vitest';
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

import { Footer } from '../Footer';

async function renderFooter() {
  const ui = await Footer();
  return render(ui);
}

describe('<Footer />', () => {
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
});
