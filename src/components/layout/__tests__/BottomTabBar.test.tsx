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

const reloadPage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/browser/reload', () => ({ reloadPage }));

/**
 * The ⊕ mounts the real entry sheet, which reaches for server actions on open.
 * Stubbed to a marker: this suite is about the BAR — that the ⊕ sits in the
 * middle, is a ≥44 px target, and opens something. `AddExpenseSheet` has its own
 * 30-case suite next door.
 */
vi.mock('@/components/expenses/AddExpenseSheet', () => ({
  AddExpenseSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-expense-sheet-mock" /> : null,
}));

import { BottomTabBar } from '../BottomTabBar';
import { MOBILE_SHEET_DESTINATIONS } from '../app-destinations';
import {
  BOTTOM_TAB_BAR_EXCLUDED_ROUTES,
  isExcludedRoute,
  stripLocalePrefix,
} from '../bottom-tab-bar.routes';

beforeEach(() => {
  cleanup();
  currentPathname = '/app';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
});

describe('<BottomTabBar /> — 5 slots, Apple HIG hard cap', () => {
  it('renders the 3 destination tabs + the ⊕ + the More trigger', () => {
    // Composition changed on 2026-07-29 (décision Q7): `simulate` moved to the
    // More sheet to free the centre slot for the ⊕. Still five slots.
    render(<BottomTabBar />);
    expect(screen.getByTestId('bottom-tab-cockpit')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-bills')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-add-expense')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-expenses')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-more')).toBeInTheDocument();
    expect(screen.queryByTestId('bottom-tab-simulate')).not.toBeInTheDocument();
  });

  it('uses the localised label set from layout.bottomTab', () => {
    render(<BottomTabBar />);
    expect(screen.getByText('Cockpit')).toBeInTheDocument();
    expect(screen.getByText('Factures')).toBeInTheDocument();
    expect(screen.getByText('Dépenses')).toBeInTheDocument();
    expect(screen.getByText('Plus')).toBeInTheDocument();
  });

  it('points each tab at the canonical /app sub-route', () => {
    render(<BottomTabBar />);
    expect(screen.getByTestId('bottom-tab-cockpit')).toHaveAttribute('href', '/app');
    expect(screen.getByTestId('bottom-tab-bills')).toHaveAttribute('href', '/app/charges');
    expect(screen.getByTestId('bottom-tab-expenses')).toHaveAttribute('href', '/app/expenses');
  });

  it('renders only one nav landmark with the localised aria-label', () => {
    render(<BottomTabBar />);
    const nav = screen.getByRole('navigation', { name: 'Navigation principale mobile' });
    expect(nav).toBeInTheDocument();
    expect(nav.getAttribute('data-testid')).toBe('bottom-tab-bar');
  });
});

/**
 * The ⊕ (décision Q7). Q7 also names the tension it creates — four tabs change
 * view and keep state, the fifth opens a modal — and keeps it anyway for
 * frequency: recording an expense is the most frequent action in the app and
 * costs 4 taps plus a scroll today. These cases pin the parts of the spec that
 * are checkable, and the ones a redesign would quietly break first.
 */
describe('<BottomTabBar /> — the ⊕ at the centre', () => {
  const slots = () =>
    Array.from(
      screen.getByTestId('bottom-tab-bar').querySelectorAll('[data-testid^="bottom-tab-"]'),
    )
      .filter((el) => el.getAttribute('data-testid') !== 'bottom-tab-bar')
      .map((el) => el.getAttribute('data-testid'));

  it('sits in the third of five slots', () => {
    render(<BottomTabBar />);
    expect(slots()).toEqual([
      'bottom-tab-cockpit',
      'bottom-tab-bills',
      'bottom-tab-add-expense',
      'bottom-tab-expenses',
      'bottom-tab-more',
    ]);
  });

  it('opens the entry sheet', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    expect(screen.queryByTestId('add-expense-sheet-mock')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('bottom-tab-add-expense'));

    expect(screen.getByTestId('add-expense-sheet-mock')).toBeInTheDocument();
  });

  it('announces itself as a dialog trigger, not a link', async () => {
    const user = userEvent.setup();
    render(<BottomTabBar />);
    const button = screen.getByTestId('bottom-tab-add-expense');

    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveAttribute('href');

    await user.click(button);
    expect(screen.getByTestId('bottom-tab-add-expense')).toHaveAttribute('aria-expanded', 'true');
  });

  it('carries an accessible name — it has no visible label by design', () => {
    // Q7: no label is what distinguishes an action from the four destinations.
    // Which makes the aria-label the ONLY name it has, so it cannot be dropped.
    render(<BottomTabBar />);
    expect(screen.getByRole('button', { name: 'Ajouter une dépense' })).toHaveAttribute(
      'data-testid',
      'bottom-tab-add-expense',
    );
  });

  it('paints a 46 × 33 block CONTAINED in the bar, not a floating FAB', () => {
    render(<BottomTabBar />);
    const painted = screen.getByTestId('bottom-tab-add-expense').firstElementChild;
    expect(painted?.className).toContain('w-[46px]');
    expect(painted?.className).toContain('h-[33px]');
    expect(painted?.className).toContain('rounded-[11px]');
    // A Material FAB overflows above the bar. Nothing here may translate it out.
    expect(painted?.className).not.toMatch(/-translate-y|absolute|rounded-full/);
  });

  it('keeps a ≥44 px touch target despite the 33 px paint', () => {
    // Q7 specifies the VISUAL size; the HIG specifies the HIT AREA. Shrinking
    // the target to match the paint would have been the wrong reading — the
    // button is h-12 (48 px) and flex-1 like every other slot.
    render(<BottomTabBar />);
    const button = screen.getByTestId('bottom-tab-add-expense');
    expect(button.className).toContain('flex-1');
    expect(button.parentElement?.className).toContain('h-12');
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

  it('lights up nothing at /app/simulator — that tab moved to the More sheet', () => {
    currentPathname = '/app/simulator';
    render(<BottomTabBar />);
    // `simulate` left the bar for the More sheet when the ⊕ took the third slot
    // (décision Q7), so no tab lights up here — the bar acts as a "return to
    // cockpit" surface, exactly as it does on /admin and /faq.
    expect(screen.queryByTestId('bottom-tab-simulate')).not.toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-cockpit')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('bottom-tab-expenses')).not.toHaveAttribute('aria-current');
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

  it('reaches Engagements from mobile — the bug this registry closes', async () => {
    // `/app/commitments` used to be declared in the desktop header only
    // (`hidden lg:flex`), so on mobile the page existed but nothing linked to
    // it outside the cockpit card. Reported in production by @thierry
    // 2026-07-25. `app-destinations.test.ts` guards the registry itself; this
    // asserts the sheet actually renders what the registry declares.
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));

    expect(screen.getByTestId('more-sheet-link-commitments')).toHaveAttribute(
      'href',
      '/app/commitments',
    );
  });

  it('renders every sheet destination the registry declares', async () => {
    // Catches a surface that stops consuming the registry: the sheet must
    // render all of them, not a hand-picked subset.
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));

    for (const destination of MOBILE_SHEET_DESTINATIONS) {
      expect(screen.getByTestId(`more-sheet-link-${destination.id}`)).toHaveAttribute(
        'href',
        destination.href,
      );
    }
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

describe('<MoreSheet /> — « Recharger l’application » (PWA standalone)', () => {
  /**
   * Le geste que `display: standalone` supprime.
   *
   * iOS retire la barre d'adresse ET le tirer-pour-rafraîchir d'une PWA
   * installée : sans cette entrée, il n'existe aucun moyen de recharger, donc
   * aucune mise à jour ne peut arriver. Rapporté par @thierry le 2026-08-05.
   */
  it('recharge le document au clic', async () => {
    reloadPage.mockClear();
    const user = userEvent.setup();
    render(<BottomTabBar />);
    await user.click(screen.getByTestId('bottom-tab-more'));
    await user.click(screen.getByTestId('more-sheet-reload'));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('marche AVEC `navigator.serviceWorker` absent — c’est tout son intérêt', async () => {
    // Falsification de l'indépendance : sans ce cas, un futur relecteur
    // supprimera cette entrée comme « doublon du bandeau de mise à jour », et
    // le seul chemin qui marche encore quand la détection est morte
    // disparaîtra avec elle.
    const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
    try {
      reloadPage.mockClear();
      const user = userEvent.setup();
      render(<BottomTabBar />);
      await user.click(screen.getByTestId('bottom-tab-more'));
      await user.click(screen.getByTestId('more-sheet-reload'));
      expect(reloadPage).toHaveBeenCalledTimes(1);
    } finally {
      if (original) Object.defineProperty(navigator, 'serviceWorker', original);
      else Reflect.deleteProperty(navigator, 'serviceWorker');
    }
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
