import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import frMessages from '../../../../messages/fr-BE.json';

/**
 * PR-BETA-6 (THI-277) — BottomTabBar + MoreSheet unit covers.
 *
 * Renders the bar under jsdom. next-intl / Link / usePathname / LocaleSwitcher
 * / logoutAction are mocked so the bar can mount without a real provider
 * tree. The mocked `usePathname` returns whatever value the test setter
 * pushed into the controllable ref, which lets each spec exercise a
 * different pathname (cockpit, bills, expenses, simulate, sub-route).
 *
 * The MoreSheet portal renders into `document.body` — testing-library
 * sees it via `screen` queries because RTL's queries traverse the whole
 * document, not just the rendered container.
 */

let currentPathname = '/app';

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => currentPathname,
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    return (key: string) => {
      // Walk the namespace.key path inside the fr-BE messages JSON.
      const parts = `${namespace}.${key}`.split('.');
      let value: unknown = frMessages;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    };
  },
}));

vi.mock('../LocaleSwitcher', () => ({
  LocaleSwitcher: () => <div data-testid="locale-switcher-mock" />,
}));

vi.mock('@/lib/actions/auth', () => ({
  logoutAction: vi.fn(async () => undefined),
}));

vi.mock('@/components/gdpr/ConsentBanner', () => ({
  reopenConsentBanner: vi.fn(),
}));

import {
  BottomTabBar,
  BOTTOM_TAB_BAR_EXCLUDED_ROUTES,
  isExcludedRoute,
  stripLocalePrefix,
} from '../BottomTabBar';

beforeEach(() => {
  cleanup();
  currentPathname = '/app';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
});

describe('<BottomTabBar /> — 5 tabs, Apple HIG hard cap', () => {
  it('renders the 4 destination tabs + the More trigger', () => {
    render(<BottomTabBar />);
    expect(screen.getByTestId('bottom-tab-cockpit')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-bills')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-expenses')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-simulate')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-more')).toBeInTheDocument();
  });

  it('uses the localised label set from layout.bottomTab', () => {
    render(<BottomTabBar />);
    expect(screen.getByText('Cockpit')).toBeInTheDocument();
    expect(screen.getByText('Factures')).toBeInTheDocument();
    expect(screen.getByText('Dépenses')).toBeInTheDocument();
    expect(screen.getByText('Simuler')).toBeInTheDocument();
    expect(screen.getByText('Plus')).toBeInTheDocument();
  });

  it('points each tab at the canonical /app sub-route', () => {
    render(<BottomTabBar />);
    expect(screen.getByTestId('bottom-tab-cockpit')).toHaveAttribute('href', '/app');
    expect(screen.getByTestId('bottom-tab-bills')).toHaveAttribute('href', '/app/charges');
    expect(screen.getByTestId('bottom-tab-expenses')).toHaveAttribute('href', '/app/expenses');
    expect(screen.getByTestId('bottom-tab-simulate')).toHaveAttribute('href', '/app/simulator');
  });

  it('renders only one nav landmark with the localised aria-label', () => {
    render(<BottomTabBar />);
    const nav = screen.getByRole('navigation', { name: 'Navigation principale mobile' });
    expect(nav).toBeInTheDocument();
    expect(nav.getAttribute('data-testid')).toBe('bottom-tab-bar');
  });
});

describe('<BottomTabBar /> — active tab detection', () => {
  it('marks the cockpit tab as current when pathname === "/app" (exact match)', () => {
    currentPathname = '/app';
    render(<BottomTabBar />);
    expect(screen.getByTestId('bottom-tab-cockpit')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('bottom-tab-bills')).not.toHaveAttribute('aria-current');
  });

  it('does NOT mark cockpit as current when on a sub-route — bills wins for /app/charges', () => {
    currentPathname = '/app/charges';
    render(<BottomTabBar />);
    expect(screen.getByTestId('bottom-tab-cockpit')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('bottom-tab-bills')).toHaveAttribute('aria-current', 'page');
  });

  it('matches startsWith for nested sub-routes (e.g. /app/expenses/abc)', () => {
    currentPathname = '/app/expenses/123';
    render(<BottomTabBar />);
    expect(screen.getByTestId('bottom-tab-expenses')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('bottom-tab-bills')).not.toHaveAttribute('aria-current');
  });

  it('matches simulate at /app/simulator', () => {
    currentPathname = '/app/simulator';
    render(<BottomTabBar />);
    expect(screen.getByTestId('bottom-tab-simulate')).toHaveAttribute('aria-current', 'page');
  });
});

describe('<BottomTabBar /> — More sheet open/close', () => {
  it('opens the More sheet on click and the close button restores focus', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);

    const moreButton = screen.getByTestId('bottom-tab-more');
    expect(moreButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('more-sheet')).not.toBeInTheDocument();

    await user.click(moreButton);

    expect(moreButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('more-sheet')).toBeInTheDocument();
    // The dialog is announced with the localised "Plus" title.
    expect(screen.getByRole('dialog', { name: 'Plus' })).toBeInTheDocument();
  });

  it('closes the More sheet on backdrop click', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));
    expect(screen.getByTestId('more-sheet')).toBeInTheDocument();

    await user.click(screen.getByTestId('more-sheet-backdrop'));
    expect(screen.queryByTestId('more-sheet')).not.toBeInTheDocument();
  });

  it('closes the More sheet on Escape', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));
    expect(screen.getByTestId('more-sheet')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('more-sheet')).not.toBeInTheDocument();
  });

  it('pins <body> with position:fixed while the sheet is open (iOS scroll lock parity)', async () => {
    Object.defineProperty(window, 'scrollY', { value: 250, writable: true, configurable: true });
    const user = userEvent.setup();
    render(<BottomTabBar />);

    await user.click(screen.getByTestId('bottom-tab-more'));
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-250px');
    expect(document.body.style.width).toBe('100%');
    expect(document.body.style.overflow).toBe('hidden');
  });
});

describe('<BottomTabBar /> — More sheet content', () => {
  it('exposes the Accounts and Settings links inside the cockpit section', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));

    expect(screen.getByTestId('more-sheet-link-accounts')).toHaveAttribute('href', '/app/accounts');
    expect(screen.getByTestId('more-sheet-link-settings')).toHaveAttribute('href', '/app/settings');
  });

  it('exposes the FAQ / glossary / legal entries in the resources section', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));

    expect(screen.getByTestId('more-sheet-link-faq')).toHaveAttribute('href', '/faq');
    expect(screen.getByTestId('more-sheet-link-glossary')).toHaveAttribute('href', '/glossaire');
    expect(screen.getByTestId('more-sheet-link-legal-cgu')).toHaveAttribute('href', '/legal/cgu');
    expect(screen.getByTestId('more-sheet-link-legal-privacy')).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
    expect(screen.getByTestId('more-sheet-link-legal-cookies')).toHaveAttribute(
      'href',
      '/legal/cookies',
    );
  });

  it('renders the theme toggle and the LocaleSwitcher inside the preferences section', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));

    expect(screen.getByTestId('more-sheet-theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switcher-mock')).toBeInTheDocument();
  });

  it('exposes the logout submit button wired to the server action', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));

    const logoutBtn = screen.getByTestId('more-sheet-logout');
    expect(logoutBtn).toBeInTheDocument();
    expect(logoutBtn).toHaveAttribute('type', 'submit');
    // The submit lives inside a <form> bound to the logoutAction server
    // action — RTL surfaces it through the parent <form>.
    expect(logoutBtn.closest('form')).not.toBeNull();
  });

  it('shows the Admin link when isAdmin=true', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar isAdmin />);
    await user.click(screen.getByTestId('bottom-tab-more'));

    const adminLink = screen.getByTestId('more-sheet-link-admin');
    expect(adminLink).toHaveAttribute('href', '/admin');
  });

  it('hides the Admin link when isAdmin is omitted (fail-closed default)', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));
    expect(screen.queryByTestId('more-sheet-link-admin')).not.toBeInTheDocument();
  });
});

describe('BOTTOM_TAB_BAR_EXCLUDED_ROUTES + isExcludedRoute (Hotfix Option A v3, mount gating)', () => {
  // The root layout (`[locale]/layout.tsx`) reads `x-pathname`, strips the
  // locale prefix, then calls `isExcludedRoute` to decide whether to render
  // the bar. These specs lock the allow-list so a future PR can't widen the
  // scope by accident.
  it('excludes the canonical landing + auth + onboarding + offline routes', () => {
    expect(isExcludedRoute('/')).toBe(true);
    expect(isExcludedRoute('/login')).toBe(true);
    expect(isExcludedRoute('/signup')).toBe(true);
    expect(isExcludedRoute('/forgot-password')).toBe(true);
    expect(isExcludedRoute('/reset-password')).toBe(true);
    expect(isExcludedRoute('/callback')).toBe(true);
    expect(isExcludedRoute('/offline')).toBe(true);
    expect(isExcludedRoute('/onboarding')).toBe(true);
  });

  it('does NOT exclude in-app destinations or resources pages', () => {
    // Fixes the "Admin sans retour" trap on iPhone smoke 2026-05-25.
    expect(isExcludedRoute('/app')).toBe(false);
    expect(isExcludedRoute('/app/charges')).toBe(false);
    expect(isExcludedRoute('/admin')).toBe(false);
    expect(isExcludedRoute('/admin/users')).toBe(false);
    // Fixes the disjointed-UX bug on resource pages.
    expect(isExcludedRoute('/faq')).toBe(false);
    expect(isExcludedRoute('/glossaire')).toBe(false);
    expect(isExcludedRoute('/legal/cgu')).toBe(false);
    expect(isExcludedRoute('/legal/privacy')).toBe(false);
    expect(isExcludedRoute('/legal/cookies')).toBe(false);
  });

  it('exposes the readonly route list so external auditors can lock the allow-list', () => {
    expect(BOTTOM_TAB_BAR_EXCLUDED_ROUTES).toContain('/');
    expect(BOTTOM_TAB_BAR_EXCLUDED_ROUTES).toContain('/login');
    expect(BOTTOM_TAB_BAR_EXCLUDED_ROUTES).toContain('/signup');
    expect(BOTTOM_TAB_BAR_EXCLUDED_ROUTES).toHaveLength(8);
  });
});

describe('stripLocalePrefix — locale-aware exclusion (Hotfix Option A v3)', () => {
  const locales = ['fr-BE', 'nl-BE', 'en', 'es-ES', 'de-DE'] as const;

  it('strips a leading /<locale>/ prefix and preserves the tail', () => {
    expect(stripLocalePrefix('/en/app', locales)).toBe('/app');
    expect(stripLocalePrefix('/de-DE/admin/users', locales)).toBe('/admin/users');
    expect(stripLocalePrefix('/nl-BE/faq', locales)).toBe('/faq');
  });

  it('collapses the bare locale path to root', () => {
    expect(stripLocalePrefix('/en', locales)).toBe('/');
    expect(stripLocalePrefix('/es-ES', locales)).toBe('/');
  });

  it('returns the input unchanged when no locale prefix is present (default fr-BE)', () => {
    // `localePrefix: 'as-needed'` keeps the default locale unprefixed.
    expect(stripLocalePrefix('/app', locales)).toBe('/app');
    expect(stripLocalePrefix('/login', locales)).toBe('/login');
    expect(stripLocalePrefix('/', locales)).toBe('/');
  });

  it('does NOT mistake a prefix-like segment for a locale (e.g. /enrollment)', () => {
    expect(stripLocalePrefix('/enrollment', locales)).toBe('/enrollment');
    // The leading slash + locale + non-slash boundary protects against the
    // false positive: `/enrollment` is not `/en/rollment`.
  });
});

describe('<MoreSheet /> — Cookie Preferences (Hotfix Option A v3 / GDPR art. 7(3))', () => {
  it('exposes the CookiePreferencesLink inside the preferences section', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));
    expect(screen.getByTestId('more-sheet-cookie-preferences')).toBeInTheDocument();
  });
});

describe('<BottomTabBar /> — accessibility contract', () => {
  it('the nav landmark and the More button carry the aria-controls relationship', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    const moreButton = screen.getByTestId('bottom-tab-more');
    expect(moreButton).toHaveAttribute('aria-controls', 'more-sheet');
    expect(moreButton).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(moreButton);
    // The opened sheet matches the aria-controls id.
    expect(screen.getByTestId('more-sheet').id).toBe('more-sheet');
  });
});
