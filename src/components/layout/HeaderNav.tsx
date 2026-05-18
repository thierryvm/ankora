'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Sun, Moon, Menu, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';

function subscribeToTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

function getThemeSnapshot() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function getServerThemeSnapshot() {
  return false;
}

type HeaderNavProps = {
  variant?: 'marketing' | 'app';
  // Mirrors the parent Header / MktNav. The drawer's marketing block
  // swaps the login/signup pair for a single "My cockpit" link when the
  // visitor already has a session — keeps the mobile UX consistent with
  // the desktop CTAs.
  isAuthenticated?: boolean;
  // PR-UX-1 — surfaces the admin link inside the cockpit drawer when the
  // signed-in user is an admin. Server-resolved upstream (`isAdmin()` in
  // `Header.tsx`) so the client never trusts itself. Default `false`
  // keeps marketing call-sites unchanged.
  isAdmin?: boolean;
};

export function HeaderNav({
  variant = 'marketing',
  isAuthenticated = false,
  isAdmin = false,
}: HeaderNavProps) {
  const t = useTranslations('common');
  // PR-UX-1 — marketing drawer reuses MktNav's link labels so the desktop
  // and mobile nav match word-for-word.
  const tMkt = useTranslations('landing.mktnav.links');
  const isDark = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [isOpen, setIsOpen] = useState(false);
  // PR-D5 a11y: replaced the previous `<label htmlFor="menu-toggle">` +
  // `<input type="checkbox" hidden>` pattern by a real `<button aria-expanded
  // aria-controls>`. The label/input pair fooled AT (VoiceOver/NVDA
  // announced "checkbox", not "button", and the visual `<div>` was not
  // focusable). The ref now points at the trigger button so we can restore
  // focus to it when the drawer closes.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Focus 1st focusable element when drawer opens
  useEffect(() => {
    if (!isOpen) return;

    const firstFocusable = navRef.current?.querySelector<HTMLElement>(
      'button, [href], input:not([type="hidden"]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();
  }, [isOpen]);

  // Handle drawer open/close: scroll lock, keyboard events, focus trap
  useEffect(() => {
    if (!isOpen) return;

    // Lock scroll
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }

      // Focus trap: keep Tab within drawer
      if (e.key === 'Tab' && navRef.current) {
        const focusableElements = navRef.current.querySelectorAll(
          'button, [href], input:not([type="hidden"]), [tabindex]:not([tabindex="-1"])',
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey && document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const toggleTheme = useCallback(() => {
    if (typeof document === 'undefined') return;

    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';

    try {
      if (next === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      localStorage.setItem('theme', next);
      // Cookie for SSR at next reload — SameSite=Lax, 1 year
      document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Safari private mode or quota exceeded
    }
  }, []);

  const handleDrawerClose = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      {/* Hamburger menu - visible on mobile only.
          PR-D5 a11y: native `<button>` with `aria-expanded` + `aria-controls`
          replaces the old label+hidden-checkbox pattern (BUG-iOS-003). */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="mobile-nav-drawer"
        aria-label={t('nav.menu')}
        className="hover:bg-muted focus-visible:ring-brand-600 flex h-10 w-10 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none lg:hidden"
      >
        {isOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>

      {/* Drawer overlay - visible when drawer is open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={handleDrawerClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer — conditional render to avoid contributing to scrollWidth
          when closed. The previous `translate-x-full` pattern (off-canvas
          slide-in) caused 320px of horizontal overflow on `/` viewport 375px
          (WCAG 2.1 Reflow 1.4.10), because `position: fixed + translate` keeps
          the box in the page's overflow flow. Mounting/unmounting on `isOpen`
          removes that overflow at the cost of the slide animation — re-add via
          Framer Motion (AnimatePresence) or CSS view-transitions in a follow-up
          PR (issue to be opened post-merge). */}
      {isOpen && (
        <nav
          id="mobile-nav-drawer"
          ref={navRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.mobileLabel')}
          className="bg-card border-border fixed top-0 right-0 bottom-0 z-40 w-80 overflow-y-auto border-l lg:hidden"
        >
          {/* PR-D5: dropped `sticky top-0` — same Playwright iPhone 14 WebKit
              pointer-event interception as the footer below. Drawer content
              fits the mobile viewport without needing sticky chrome. */}
          <div className="border-border bg-card flex items-center justify-between border-b p-4">
            <span className="text-sm font-semibold">{t('nav.menu')}</span>
            <button
              onClick={handleDrawerClose}
              className="hover:bg-muted focus-visible:ring-brand-600 flex h-8 w-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              aria-label={t('nav.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation links */}
          <div className="space-y-2 p-4">
            {variant === 'marketing' && (
              <>
                {/* PR-UX-1 — parity with MktNav desktop: Product / Simulator /
                    Pricing point at on-page anchors; FAQ kept as the only
                    cross-page entry. `#features` (previous target) never
                    existed in the landing DOM — `#principles` is canonical. */}
                <Link
                  href="/#principles"
                  onClick={handleDrawerClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {tMkt('product')}
                </Link>
                <Link
                  href="/#simulator"
                  onClick={handleDrawerClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {tMkt('simulator')}
                </Link>
                <Link
                  href="/#pricing"
                  onClick={handleDrawerClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {tMkt('pricing')}
                </Link>
                <Link
                  href="/faq"
                  onClick={handleDrawerClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {t('nav.faq')}
                </Link>

                {/* PR-D5 — auth entrypoints inside the mobile drawer.
                    Resolves BUG-iOS-003 (login unreachable in ≤ 2 taps from
                    landing on iPhone — the header CTAs were `hidden sm:`,
                    invisible below 640px, and the drawer had no fallback).
                    `data-testid` on the login link lets Playwright target
                    it directly without role/name globbing — `getByRole('link',
                    { name: /se connecter/i })` also matches the (hidden)
                    desktop header CTA and `.first()` picks the wrong one.

                    When the visitor is already signed in, replace the
                    login/signup pair with a single "My cockpit" link so the
                    drawer stays consistent with the desktop CTA. Avoids the
                    UX bug where a returning user lands on `/` and thinks
                    their session expired. */}
                <div className="border-border mt-2 space-y-2 border-t pt-2">
                  {isAuthenticated ? (
                    <Link
                      href="/app"
                      onClick={handleDrawerClose}
                      data-testid="drawer-cockpit-link"
                      className="bg-brand-700 hover:bg-brand-800 focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-center text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                      {t('nav.myCockpit')}
                    </Link>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={handleDrawerClose}
                        data-testid="drawer-login-link"
                        className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      >
                        {t('nav.login')}
                      </Link>
                      <Link
                        href="/signup"
                        onClick={handleDrawerClose}
                        data-testid="drawer-signup-link"
                        className="bg-brand-700 hover:bg-brand-800 focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-center text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      >
                        {t('nav.signup')}
                      </Link>
                    </>
                  )}
                </div>
              </>
            )}

            {variant === 'app' && (
              <>
                <Link
                  href="/app"
                  onClick={handleDrawerClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {t('nav.dashboard')}
                </Link>
                <Link
                  href="/app/accounts"
                  onClick={handleDrawerClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {t('nav.accounts')}
                </Link>
                <Link
                  href="/app/charges"
                  onClick={handleDrawerClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {t('nav.charges')}
                </Link>
                <Link
                  href="/app/expenses"
                  onClick={handleDrawerClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {t('nav.expenses')}
                </Link>
                <Link
                  href="/app/simulator"
                  onClick={handleDrawerClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {t('nav.simulator')}
                </Link>
                <Link
                  href="/app/settings"
                  onClick={handleDrawerClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {t('nav.settings')}
                </Link>
                {/* PR-UX-1 — admin entry mirrors the desktop cockpit nav
                    (Header.tsx). Route is `/admin` (not `/app/admin`).
                    Amber dot uses `bg-amber-700` for WCAG SC 1.4.11 parity
                    in both themes (≈ 4.46:1 light, ≈ 3.32:1 dark). Bumped
                    from amber-600 (failed AA in light mode at ≈ 2.91:1).
                    `aria-label` carries the "founder only" context so AT
                    users get the same hint as desktop. */}
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={handleDrawerClose}
                    aria-label={t('nav.adminAriaLabel')}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <span>{t('nav.admin')}</span>
                    <span
                      aria-hidden="true"
                      className="inline-block h-1.5 w-1.5 rounded-full bg-amber-700"
                    />
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Drawer footer - theme toggle + locale switcher.
              PR-D5: `sticky bottom-0` removed — on Playwright iPhone 14
              WebKit the sticky footer was reported as intercepting pointer
              events on links above it (visible regression in the auth-flow
              ≤ 2 taps test). Functionally equivalent in normal flow because
              the drawer content rarely overflows the viewport on mobile;
              if it ever does we'll re-introduce sticky behind a feature
              detect. */}
          <div className="border-border bg-card mt-auto space-y-3 border-t p-4">
            <button
              onClick={toggleTheme}
              className="bg-surface-muted text-foreground hover:bg-surface-muted/80 focus-visible:ring-brand-600 flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              aria-label={isDark ? t('nav.lightMode') : t('nav.darkMode')}
            >
              <span className="dark:hidden">{t('nav.darkMode')}</span>
              <span className="hidden dark:block">{t('nav.lightMode')}</span>
              <div className="h-4 w-4">
                <Moon className="h-4 w-4 dark:hidden" aria-hidden="true" />
                <Sun className="hidden h-4 w-4 dark:block" aria-hidden="true" />
              </div>
            </button>

            <LocaleSwitcher />
          </div>
        </nav>
      )}

      {/* Desktop theme toggle + locale switcher - visible on desktop only */}
      <div className="hidden items-center gap-2 lg:flex">
        <button
          onClick={toggleTheme}
          className="hover:bg-muted focus-visible:ring-brand-600 flex h-10 w-10 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label={isDark ? t('nav.lightMode') : t('nav.darkMode')}
        >
          <Moon className="h-5 w-5 dark:hidden" aria-hidden="true" />
          <Sun className="hidden h-5 w-5 dark:block" aria-hidden="true" />
        </button>

        <LocaleSwitcher />
      </div>
    </>
  );
}
