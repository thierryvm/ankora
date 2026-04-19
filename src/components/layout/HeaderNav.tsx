'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sun, Moon, Menu, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './LocaleSwitcher';

type HeaderNavProps = {
  variant?: 'marketing' | 'app';
};

export function HeaderNav({ variant = 'marketing' }: HeaderNavProps) {
  const t = useTranslations('common');
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.getAttribute('data-theme') === 'dark';
  });
  const [isOpen, setIsOpen] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close drawer on Escape key, handle focus trap and scroll lock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        if (checkboxRef.current) {
          checkboxRef.current.checked = false;
          checkboxRef.current.focus();
        }
      }

      // Focus trap: keep Tab within drawer
      if (e.key === 'Tab' && isOpen && navRef.current) {
        const focusableElements = navRef.current.querySelectorAll(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
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

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const toggleTheme = useCallback(() => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);

    if (typeof document === 'undefined') return;

    try {
      if (newIsDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
      }
    } catch {
      // Safari private mode or quota exceeded
    }
  }, [isDark]);

  const handleDrawerClose = useCallback(() => {
    setIsOpen(false);
    if (checkboxRef.current) {
      checkboxRef.current.checked = false;
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
            <span>{isDark ? t('nav.lightMode') : t('nav.darkMode')}</span>
            <div className="h-4 w-4">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <LocaleSwitcher />
      </div>
    </>
  );
}
