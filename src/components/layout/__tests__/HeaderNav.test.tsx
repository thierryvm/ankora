import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import frMessages from '../../../../messages/fr-BE.json';

/**
 * HeaderNav is a Client Component with a mobile drawer that shows different
 * auth CTAs based on the `isAuthenticated` prop. We mock next-intl and the
 * locale-aware Link / LocaleSwitcher so the drawer can be rendered + opened
 * under jsdom without a real next-intl provider.
 */

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    return (key: string) => {
      const ns = (frMessages as Record<string, Record<string, unknown>>)[namespace.split('.')[0]!];
      const parts = namespace.split('.').slice(1);
      let value: unknown = ns;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        }
      }
      const keyParts = key.split('.');
      for (const part of keyParts) {
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

import { HeaderNav } from '../HeaderNav';

beforeEach(() => {
  cleanup();
});

async function openDrawer(): Promise<void> {
  const user = userEvent.setup();
  // The hamburger button shares the menu aria-label.
  const trigger = screen.getByRole('button', { name: 'Menu' });
  await user.click(trigger);
}

describe('<HeaderNav /> mobile drawer — auth CTAs', () => {
  it('marketing variant + anonymous shows login + signup links in the drawer', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated={false} />);
    await openDrawer();

    expect(screen.getByTestId('drawer-login-link')).toHaveAttribute('href', '/login');
    expect(screen.getByTestId('drawer-signup-link')).toHaveAttribute('href', '/signup');
    expect(screen.queryByTestId('drawer-cockpit-link')).not.toBeInTheDocument();
  });

  it('marketing variant + authenticated shows the "Mon cockpit" link instead', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated />);
    await openDrawer();

    const cockpit = screen.getByTestId('drawer-cockpit-link');
    expect(cockpit).toHaveAttribute('href', '/app');
    expect(cockpit).toHaveTextContent('Mon cockpit');
    expect(screen.queryByTestId('drawer-login-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drawer-signup-link')).not.toBeInTheDocument();
  });

  it('marketing variant defaults to anonymous (no isAuthenticated prop)', async () => {
    render(<HeaderNav variant="marketing" />);
    await openDrawer();

    expect(screen.getByTestId('drawer-login-link')).toBeInTheDocument();
    expect(screen.queryByTestId('drawer-cockpit-link')).not.toBeInTheDocument();
  });

  it('app variant no longer renders the hamburger drawer (PR-BETA-6 / THI-277)', () => {
    // PR-BETA-6 (THI-277, 2026-05-25): the right-to-left drawer was replaced
    // by the Apple-HIG Bottom Tab Bar on the `/app/*` surface. HeaderNav now
    // short-circuits the trigger + portal for `variant="app"`. The Bottom
    // Tab Bar's "More" sheet is the canonical secondary-nav surface for
    // signed-in mobile users.
    render(<HeaderNav variant="app" isAuthenticated />);

    // No hamburger trigger and therefore no drawer can be opened.
    expect(screen.queryByTestId('header-nav-trigger')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Navigation mobile' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('drawer-cockpit-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drawer-login-link')).not.toBeInTheDocument();
  });
});

describe('<HeaderNav /> mobile drawer — PR-UX-1 marketing parity with desktop MktNav', () => {
  it('exposes Product / Simulator / Pricing anchored at the canonical landing ids', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated={false} />);
    await openDrawer();

    expect(screen.getByRole('link', { name: 'Produit' })).toHaveAttribute('href', '/#principles');
    expect(screen.getByRole('link', { name: 'Simulateur' })).toHaveAttribute('href', '/#simulator');
    expect(screen.getByRole('link', { name: 'Tarifs' })).toHaveAttribute('href', '/#pricing');
  });

  it('keeps FAQ as the only cross-page entry inside the marketing drawer', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated={false} />);
    await openDrawer();
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq');
  });
});

/**
 * THI-250 (PR-FIX-DRAWER, 2026-05-23): iOS Safari rubber-band scroll lock.
 * Plain `document.body.style.overflow = 'hidden'` is silently ignored by
 * WebKit on iOS — the page behind the drawer overlay continues to scroll on
 * swipe. We switch to the Stripe / Linear / Notion pattern: capture the
 * current `scrollY`, pin <body> with `position: fixed; top: -<scrollY>px`,
 * then restore everything (including the exact scroll position) on cleanup.
 *
 * Tested under jsdom (which honours the style mutations and lets us assert
 * the contract) — the real-iOS validation is a manual smoke step documented
 * in `docs/runbooks/dev-on-iphone.md`.
 */
describe('<HeaderNav /> mobile drawer — THI-250 iOS-robust scroll lock', () => {
  beforeEach(() => {
    // Reset <body> inline styles between tests — userEvent + cleanup leave
    // them in whatever state the last test landed on, which leaks the
    // `position: fixed` assertion of the previous test into the next render.
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
  });

  it('pins <body> with position:fixed + scrollY offset when the drawer opens', async () => {
    Object.defineProperty(window, 'scrollY', { value: 300, writable: true, configurable: true });

    render(<HeaderNav variant="marketing" isAuthenticated={false} />);
    await openDrawer();

    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-300px');
    expect(document.body.style.width).toBe('100%');
    // Non-iOS fallback preserved.
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores <body> styles and the exact scroll position when the drawer closes', async () => {
    Object.defineProperty(window, 'scrollY', { value: 450, writable: true, configurable: true });
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    const user = userEvent.setup();
    render(<HeaderNav variant="marketing" isAuthenticated={false} />);
    await openDrawer();

    // Sanity: lock is applied.
    expect(document.body.style.position).toBe('fixed');

    // Close the drawer via the X button (matches the prod UX path).
    const closeButton = screen.getByRole('button', { name: 'Fermer' });
    await user.click(closeButton);

    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.width).toBe('');
    expect(document.body.style.overflow).toBe('');
    // `behavior: 'instant'` overrides the `data-scroll-behavior="smooth"`
    // attribute applied to <html> in layout.tsx — without it the restore
    // would animate and the user would see a brief scroll-jump.
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 450, left: 0, behavior: 'instant' });

    scrollToSpy.mockRestore();
  });

  it('captures scrollY at open time, not at close time', async () => {
    Object.defineProperty(window, 'scrollY', { value: 100, writable: true, configurable: true });
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    const user = userEvent.setup();
    render(<HeaderNav variant="marketing" isAuthenticated={false} />);
    await openDrawer();

    // Even if scrollY mutates while the drawer is open (shouldn't happen
    // because <body> is position:fixed, but jsdom doesn't enforce that
    // invariant), the cleanup must restore the snapshot captured at open
    // time — not the post-mutation value.
    Object.defineProperty(window, 'scrollY', { value: 9999, writable: true, configurable: true });

    const closeButton = screen.getByRole('button', { name: 'Fermer' });
    await user.click(closeButton);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 100, left: 0, behavior: 'instant' });
    scrollToSpy.mockRestore();
  });
});

/**
 * THI-251 (PR-FIX-DRAWER, 2026-05-23): iOS PWA standalone safe-area inset on
 * the drawer wrapper. Without `pt-[env(safe-area-inset-top)]` the close X
 * button rendered behind the iPhone status bar (notch / Dynamic Island)
 * because the drawer lives inside a Portal child of <body> (PR #171) and
 * doesn't inherit the sticky header's inset. The site already declares
 * `viewport-fit=cover` in `[locale]/layout.tsx`, so the inset value is
 * non-zero on real hardware in PWA standalone mode.
 */
describe('<HeaderNav /> mobile drawer — THI-251 safe-area inset on PWA standalone', () => {
  it('drawer <nav> carries the env(safe-area-inset-top) padding-top utility', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated={false} />);
    await openDrawer();

    const drawer = screen.getByRole('dialog', { name: 'Navigation mobile' });
    expect(drawer.className).toContain('pt-[env(safe-area-inset-top)]');
  });
});

describe('<HeaderNav /> mobile drawer — PR-UX-1 / PR-BETA-6 admin entry handoff', () => {
  // PR-BETA-6 (THI-277): admin entry handoff. The app-variant drawer no
  // longer renders an Admin link because the drawer itself is short-
  // circuited; the admin entry is now surfaced through the BottomTabBar's
  // "More" sheet (see BottomTabBar.test.tsx / MoreSheet covers). These two
  // assertions guarantee the drawer-side never re-grows the entry by
  // mistake.
  it('app variant: drawer never rendered, no Admin entry to assert', () => {
    render(<HeaderNav variant="app" isAuthenticated isAdmin />);
    expect(screen.queryByTestId('header-nav-trigger')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Espace admin (réservé fondateur)' }),
    ).not.toBeInTheDocument();
  });

  it('marketing variant never exposes the Admin link, even if isAdmin=true', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated isAdmin />);
    await openDrawer();
    expect(
      screen.queryByRole('link', { name: 'Espace admin (réservé fondateur)' }),
    ).not.toBeInTheDocument();
  });
});
