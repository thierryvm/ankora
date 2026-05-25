import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';

/**
 * Header is an async Server Component using `next-intl/server` and the
 * locale-aware Link from `@/i18n/navigation`. We mock both at module level
 * so we can render the resolved JSX directly under jsdom.
 */
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns = (messages as Record<string, Record<string, unknown>>)[namespace] ?? {};
    return (key: string) => {
      // Walk dot-separated keys like "nav.features"
      const parts = key.split('.');
      let value: unknown = ns;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key; // fallback to key for missing entries
        }
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

vi.mock('../HeaderNav', () => ({
  HeaderNav: ({
    variant,
    isAuthenticated,
    isAdmin,
    hideMobileTrigger,
  }: {
    variant: string;
    isAuthenticated?: boolean;
    isAdmin?: boolean;
    hideMobileTrigger?: boolean;
  }) => (
    <div
      data-testid="header-nav-mock"
      data-variant={variant}
      data-is-authenticated={String(isAuthenticated ?? false)}
      data-is-admin={String(isAdmin ?? false)}
      data-hide-mobile-trigger={String(hideMobileTrigger ?? false)}
    />
  ),
}));

// PR-BETA-6 hotfix #3 — Header reads the `x-pathname` request header to
// decide whether to suppress the mobile hamburger (duplicate-nav fix
// against the persistent BottomTabBar). Default to `/` so the existing
// specs keep their pre-hotfix semantics; tests that need a different
// route call `setPathname()` below.
const pathnameRef = { value: '/' };
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => (name === 'x-pathname' ? pathnameRef.value : null),
  }),
}));

// PR-SEC-ADMIN — `isAdmin()` reads env + Supabase session at runtime.
// In jsdom env validation throws ("Invalid public environment variables").
// Mock the helper to a deterministic boolean per test below via setIsAdmin().
const isAdminRef = { value: false };
vi.mock('@/lib/auth/is-admin', () => ({
  isAdmin: async () => isAdminRef.value,
}));

// Header now auto-detects auth state on the marketing variant when the
// `isAuthenticated` prop is omitted. Mock the helper so tests stay
// deterministic — tests that pass the prop explicitly override the fallback.
const optionalUserRef = { value: null as null | { id: string } };
vi.mock('@/lib/auth/require-user', () => ({
  getOptionalUser: async () => optionalUserRef.value,
}));

import { Header } from '../Header';

function setIsAdmin(value: boolean): void {
  isAdminRef.value = value;
}

function setOptionalUser(value: null | { id: string }): void {
  optionalUserRef.value = value;
}

function setPathname(value: string): void {
  pathnameRef.value = value;
}

async function renderHeader(props: Parameters<typeof Header>[0] = {}) {
  const ui = await Header(props);
  return render(ui);
}

describe('<Header />', () => {
  beforeEach(() => {
    setIsAdmin(false);
    setOptionalUser(null);
    setPathname('/');
  });

  it('renders the marketing variant by default with login + signup CTAs', async () => {
    await renderHeader();
    // Marketing nav links
    expect(screen.getByRole('link', { name: 'Fonctionnalités' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'FAQ' })).toBeInTheDocument();
    // Auth CTAs
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Créer un compte' })).toBeInTheDocument();
  });

  it('auto-detects auth state on marketing variant when prop is omitted', async () => {
    // Simulates the new wiring on public pages (FAQ, glossaire, legal/*)
    // where `<Header />` is rendered without `isAuthenticated`. The fallback
    // calls `getOptionalUser` server-side, which we mock to a valid session.
    setOptionalUser({ id: 'user-thierry' });
    await renderHeader();
    expect(screen.getByRole('link', { name: 'Mon cockpit' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Créer un compte' })).not.toBeInTheDocument();
  });

  it('explicit isAuthenticated prop overrides the auto-detect fallback', async () => {
    // Even if `getOptionalUser` would say "logged in", a call-site that
    // forces `isAuthenticated={false}` must win — important for cases like
    // a "Sign out" landing where we want anonymous-looking chrome.
    setOptionalUser({ id: 'user-thierry' });
    await renderHeader({ variant: 'marketing', isAuthenticated: false });
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mon cockpit' })).not.toBeInTheDocument();
  });

  it('marketing variant + isAuthenticated shows the cockpit CTA instead of login/signup', async () => {
    await renderHeader({ variant: 'marketing', isAuthenticated: true });
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Créer un compte' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mon cockpit' })).toBeInTheDocument();
  });

  it('app variant shows the in-app navigation (dashboard, accounts, charges, expenses, simulator, settings)', async () => {
    await renderHeader({ variant: 'app', isAuthenticated: true });
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Comptes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Charges' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dépenses' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Simulateur' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Paramètres' })).toBeInTheDocument();
  });

  it('app variant links point to the correct routes', async () => {
    await renderHeader({ variant: 'app', isAuthenticated: true });
    expect(screen.getByRole('link', { name: 'Dépenses' })).toHaveAttribute('href', '/app/expenses');
    expect(screen.getByRole('link', { name: 'Simulateur' })).toHaveAttribute(
      'href',
      '/app/simulator',
    );
  });

  it('marketing variant does not show the app-only links (Dépenses / Simulateur)', async () => {
    await renderHeader({ variant: 'marketing', isAuthenticated: false });
    expect(screen.queryByRole('link', { name: 'Dépenses' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Simulateur' })).not.toBeInTheDocument();
  });

  it('home link always points to / regardless of auth state (issue #95)', async () => {
    // Per issue #95, the logo always navigates to the public landing for
    // consistency with MktNav.tsx. Clicking from /app is a deliberate
    // "go home" action and avoids the title-flash no-op described in #95.
    const { unmount } = await renderHeader({ variant: 'marketing', isAuthenticated: false });
    expect(screen.getByLabelText('Accueil Ankora')).toHaveAttribute('href', '/');
    unmount();

    await renderHeader({ variant: 'marketing', isAuthenticated: true });
    expect(screen.getByLabelText('Accueil Ankora')).toHaveAttribute('href', '/');
  });

  // PR-SEC-ADMIN — admin nav link conditional rendering tests
  it('app variant + isAdmin=true shows the Admin link with private-zone marker', async () => {
    setIsAdmin(true);
    await renderHeader({ variant: 'app', isAuthenticated: true });
    const adminLink = screen.getByRole('link', { name: 'Espace admin (réservé fondateur)' });
    expect(adminLink).toBeInTheDocument();
    expect(adminLink).toHaveAttribute('href', '/admin');
  });

  it('app variant + isAdmin=false hides the Admin link entirely', async () => {
    setIsAdmin(false);
    await renderHeader({ variant: 'app', isAuthenticated: true });
    expect(screen.queryByRole('link', { name: /Admin/ })).not.toBeInTheDocument();
  });

  it('marketing variant never shows the Admin link, even if isAdmin=true', async () => {
    setIsAdmin(true);
    await renderHeader({ variant: 'marketing', isAuthenticated: true });
    expect(screen.queryByRole('link', { name: /Admin/ })).not.toBeInTheDocument();
  });

  // PR-UX-1 — admin parity desktop ↔ mobile drawer: Header must forward the
  // server-resolved `isAdmin` flag into HeaderNav so the cockpit drawer
  // mirrors the desktop admin link without a duplicate server round-trip.
  it('app variant + isAdmin=true forwards isAdmin to HeaderNav (mobile drawer parity)', async () => {
    setIsAdmin(true);
    await renderHeader({ variant: 'app', isAuthenticated: true });
    const drawer = screen.getByTestId('header-nav-mock');
    expect(drawer).toHaveAttribute('data-variant', 'app');
    expect(drawer).toHaveAttribute('data-is-admin', 'true');
  });

  it('app variant + isAdmin=false forwards isAdmin=false to HeaderNav', async () => {
    setIsAdmin(false);
    await renderHeader({ variant: 'app', isAuthenticated: true });
    expect(screen.getByTestId('header-nav-mock')).toHaveAttribute('data-is-admin', 'false');
  });

  it('marketing variant never forwards isAdmin=true (server skips the check)', async () => {
    setIsAdmin(true);
    await renderHeader({ variant: 'marketing', isAuthenticated: true });
    // Marketing pages are public — `showAdminLink` short-circuits before
    // calling isAdmin(), so the drawer always gets isAdmin=false.
    expect(screen.getByTestId('header-nav-mock')).toHaveAttribute('data-is-admin', 'false');
  });

  // PR-BETA-6 hotfix #3 — duplicate-nav fix on mobile. When the visitor is
  // authenticated AND the route is NOT in `BOTTOM_TAB_BAR_EXCLUDED_ROUTES`
  // (i.e. the persistent bar will mount), the Header must forward
  // `hideMobileTrigger=true` so HeaderNav suppresses the hamburger.
  describe('hideMobileTrigger forwarding (Hotfix #3 anti-duplicate-nav)', () => {
    it('forwards hideMobileTrigger=true on /faq for an authenticated visitor', async () => {
      setPathname('/faq');
      await renderHeader({ variant: 'marketing', isAuthenticated: true });
      expect(screen.getByTestId('header-nav-mock')).toHaveAttribute(
        'data-hide-mobile-trigger',
        'true',
      );
    });

    it('forwards hideMobileTrigger=true on /legal/cgu for an authenticated visitor', async () => {
      setPathname('/legal/cgu');
      await renderHeader({ variant: 'marketing', isAuthenticated: true });
      expect(screen.getByTestId('header-nav-mock')).toHaveAttribute(
        'data-hide-mobile-trigger',
        'true',
      );
    });

    it('keeps hideMobileTrigger=false on the landing (excluded route)', async () => {
      setPathname('/');
      await renderHeader({ variant: 'marketing', isAuthenticated: true });
      expect(screen.getByTestId('header-nav-mock')).toHaveAttribute(
        'data-hide-mobile-trigger',
        'false',
      );
    });

    it('keeps hideMobileTrigger=false on /login (auth route excluded)', async () => {
      setPathname('/login');
      await renderHeader({ variant: 'marketing', isAuthenticated: true });
      expect(screen.getByTestId('header-nav-mock')).toHaveAttribute(
        'data-hide-mobile-trigger',
        'false',
      );
    });

    it('keeps hideMobileTrigger=false for anonymous visitor on /faq', async () => {
      setPathname('/faq');
      await renderHeader({ variant: 'marketing', isAuthenticated: false });
      // No bar to compete with → marketing burger stays.
      expect(screen.getByTestId('header-nav-mock')).toHaveAttribute(
        'data-hide-mobile-trigger',
        'false',
      );
    });

    it('strips the locale prefix before checking exclusion (e.g. /en/faq)', async () => {
      setPathname('/en/faq');
      await renderHeader({ variant: 'marketing', isAuthenticated: true });
      expect(screen.getByTestId('header-nav-mock')).toHaveAttribute(
        'data-hide-mobile-trigger',
        'true',
      );
    });
  });

  it('home link has the tactile press animation, gated on motion-safe (issue #95)', async () => {
    await renderHeader({ variant: 'app', isAuthenticated: true });
    const link = screen.getByLabelText('Accueil Ankora');
    // The full animation set: transition-transform + duration-150 +
    // motion-safe:active:scale-95 (the latter respects prefers-reduced-motion).
    expect(link).toHaveClass('transition-transform', 'duration-150', 'motion-safe:active:scale-95');
  });
});
