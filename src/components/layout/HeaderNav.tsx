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
};

export function HeaderNav({ variant = 'marketing' }: HeaderNavProps) {
  const t = useTranslations('common');
  const isDark = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [isOpen, setIsOpen] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);
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
        if (checkboxRef.current) {
          checkboxRef.current.checked = false;
          checkboxRef.current.focus();
        }
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
    if (checkboxRef.current) {
      checkboxRef.current.checked = false;
      checkboxRef.current.focus();
    }
  }, []);

  return (
    <>
      {/* Hamburger menu - visible on mobile only */}
      <label
        htmlFor="menu-toggle"
        className="flex cursor-pointer items-center lg:hidden"
        aria-label={t('nav.menu')}
      >
        <input
          ref={checkboxRef}
          id="menu-toggle"
          type="checkbox"
          className="hidden"
          checked={isOpen}
          onChange={(e) => setIsOpen(e.target.checked)}
          aria-expanded={isOpen}
        />
        <div className="hover:bg-muted focus-visible:ring-brand-600 flex h-10 w-10 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </div>
      </label>

      {/* Drawer overlay - visible when drawer is open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={handleDrawerClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer - fixed off-canvas menu */}
      <nav
        ref={navRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.mobileLabel')}
        className={`bg-card border-border fixed top-0 right-0 bottom-0 z-40 w-80 overflow-y-auto border-l transition-transform duration-300 lg:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="border-border bg-card sticky top-0 flex items-center justify-between border-b p-4">
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
              <Link
                href="/#features"
                onClick={handleDrawerClose}
                className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {t('nav.features')}
              </Link>
              <Link
                href="/faq"
                onClick={handleDrawerClose}
                className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {t('nav.faq')}
              </Link>
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
                href="/app/settings"
                onClick={handleDrawerClose}
                className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-brand-600 block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {t('nav.settings')}
              </Link>
            </>
          )}
        </div>

        {/* Drawer footer - theme toggle + locale switcher */}
        <div className="border-border bg-card sticky bottom-0 space-y-3 border-t p-4">
          <button
            onClick={toggleTheme}
            className="bg-muted hover:bg-muted/80 focus-visible:ring-brand-600 flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
