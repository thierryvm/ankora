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
    hideMobileTrigger,
  }: {
    variant: string;
    isAuthenticated?: boolean;
    hideMobileTrigger?: boolean;
  }) => (
    <div
      data-testid="header-nav-mock"
      data-variant={variant}
      data-is-authenticated={String(isAuthenticated ?? false)}
      data-hide-mobile-trigger={String(hideMobileTrigger ?? false)}
    />
  ),
}));

// PR-BETA-6 hotfix #3 + hotfix #4 — Header reads
// `shouldMountBottomTabBar()` to decide whether to suppress the mobile
// hamburger (duplicate-nav fix against the persistent BottomTabBar).
// The helper itself reads `next/headers` + `getOptionalUser` + the
// exclusion list; mocking it directly here keeps each spec deterministic
// without re-deriving the gating logic in the test. Default to `false`
// so the existing specs keep their pre-hotfix semantics; tests that
// need the helper to return true call `setBottomTabBarMounted(true)`.
const bottomTabBarMountedRef = { value: false };
vi.mock('@/lib/layout/bottom-tab-bar-state', () => ({
  shouldMountBottomTabBar: async () => bottomTabBarMountedRef.value,
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

function setBottomTabBarMounted(value: boolean): void {
  bottomTabBarMountedRef.value = value;
}

async function renderHeader(props: Parameters<typeof Header>[0] = {}) {
  const ui = await Header(props);
  return render(ui);
}

describe('<Header />', () => {
  beforeEach(() => {
    setIsAdmin(false);
    setOptionalUser(null);
    setBottomTabBarMounted(false);
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

  // PR-BETA-CLEANUP (THI-279, 2026-05-25): the `isAdmin` prop forwarding to
  // HeaderNav was removed — its sole consumer was the dead `variant === 'app'`
  // drawer block (unreachable since BETA-6 hotfix #1). The desktop admin
  // link covered above is now the only Header.tsx surface that needs
  // `showAdminLink`; the mobile admin entry lives in the BottomTabBar's
  // More sheet (`MoreSheet.test.tsx` / `more-sheet-link-admin`).

  // PR-BETA-6 hotfix #3 + hotfix #4 — duplicate-nav fix on mobile.
  // Header forwards `hideMobileTrigger` by delegating to
  // `shouldMountBottomTabBar()` (single source of truth shared with the
  // bar mount in `[locale]/layout.tsx`, the Footer nav hiding, and the
  // ScrollToTop FAB lift). Mock the helper directly so the spec proves
  // the wiring without re-deriving the auth+pathname matrix here (those
  // are covered in bottom-tab-bar-state.test.ts).
  describe('hideMobileTrigger forwarding (Hotfix #3 anti-duplicate-nav)', () => {
    it('forwards hideMobileTrigger=true when shouldMountBottomTabBar() → true', async () => {
      setBottomTabBarMounted(true);
      await renderHeader({ variant: 'marketing', isAuthenticated: true });
      expect(screen.getByTestId('header-nav-mock')).toHaveAttribute(
        'data-hide-mobile-trigger',
        'true',
      );
    });

    it('keeps hideMobileTrigger=false when shouldMountBottomTabBar() → false', async () => {
      setBottomTabBarMounted(false);
      await renderHeader({ variant: 'marketing', isAuthenticated: true });
      expect(screen.getByTestId('header-nav-mock')).toHaveAttribute(
        'data-hide-mobile-trigger',
        'false',
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
