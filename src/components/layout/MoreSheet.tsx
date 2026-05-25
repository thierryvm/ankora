'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Moon, Sun, X, LogOut } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { useIsClient } from '@/lib/hooks/useIsClient';
import { logoutAction } from '@/lib/actions/auth';
import { LocaleSwitcher } from './LocaleSwitcher';

/**
 * PR-BETA-6 — "More" sheet for the mobile Bottom Tab Bar (THI-277).
 *
 * Slide-up modal that surfaces every secondary navigation entry that does
 * not fit in the 5-tab Apple HIG cap: Accounts, Settings, Admin (when
 * privileged), FAQ, Glossary, Legal, ThemeToggle, LocaleSwitcher, Logout.
 *
 * Rendering & isolation: portalled into <body> like the legacy drawer so it
 * escapes the parent stacking contexts (sticky header + bottom-tab-bar with
 * `backdrop-blur`). Without the portal, the sheet's z-index is confined to
 * the bar's painted region on iOS WebKit (same bug class as #119 fixed in
 * the marketing drawer — see HeaderNav.tsx JSDoc).
 *
 * iOS scroll lock: pin <body> with `position: fixed` + captured scrollY.
 * Vanilla `overflow: hidden` is ignored by iOS Safari rubber-band scroll
 * (THI-250 history). Restore both styles AND scroll position on cleanup
 * with `behavior: 'instant'` to override the global `data-scroll-behavior:
 * smooth` set on <html>.
 *
 * Accessibility: real `role="dialog"` + `aria-modal` + focus trap on Tab /
 * Shift+Tab. Esc closes and restores focus to the trigger (the More tab
 * button on the bar). The backdrop tap also closes — equivalent to the
 * Apple iOS sheet behaviour where dragging down dismisses (drag-to-dismiss
 * is a follow-up; backdrop tap covers the same intent).
 */

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

export type MoreSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
};

export function MoreSheet({ isOpen, onClose, isAdmin = false }: MoreSheetProps) {
  const t = useTranslations('layout.moreSheet');
  const tLinks = useTranslations('layout.moreSheet.links');
  const tSections = useTranslations('layout.moreSheet.sections');
  const isClient = useIsClient();
  const isDark = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

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
      document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Safari private mode or quota exceeded — fall through.
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const { scrollY } = window;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key === 'Tab' && sheetRef.current) {
        const focusableElements = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], select, input:not([type="hidden"]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

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

    // Focus the close button when the sheet opens so screen readers and
    // keyboard users land inside the dialog.
    const closeBtn = sheetRef.current?.querySelector<HTMLElement>('[data-more-sheet-close]');
    closeBtn?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
    };
  }, [isOpen, handleClose]);

  if (!isClient || !isOpen) return null;

  const linkClass =
    'text-foreground hover:bg-muted focus-visible:ring-brand-600 flex items-center justify-between rounded-md px-3 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none';

  const node = (
    <>
      <div
        data-testid="more-sheet-backdrop"
        className="bg-foreground/40 fixed inset-0 z-50 md:hidden"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        id="more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        data-testid="more-sheet"
        className="bg-card border-border fixed right-0 bottom-0 left-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] shadow-xl md:hidden"
      >
        {/* Drag handle — visual affordance only. Real drag-to-dismiss is a
            follow-up; for now the backdrop tap and the close button cover
            the dismiss flows. */}
        <div className="flex justify-center pt-2 pb-1">
          <span aria-hidden="true" className="bg-muted-foreground/30 h-1 w-10 rounded-full" />
        </div>

        <div className="border-border flex items-center justify-between border-b px-4 pb-3">
          <span className="text-foreground text-sm font-semibold">{t('title')}</span>
          <button
            type="button"
            data-more-sheet-close
            onClick={handleClose}
            aria-label={t('close')}
            className="hover:bg-muted focus-visible:ring-brand-600 flex h-8 w-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <section aria-labelledby="more-section-cockpit" className="space-y-1">
            <h3
              id="more-section-cockpit"
              className="text-muted-foreground px-3 text-[11px] font-medium tracking-wider uppercase"
            >
              {tSections('cockpit')}
            </h3>
            <Link
              href="/app/accounts"
              onClick={handleClose}
              data-testid="more-sheet-link-accounts"
              className={linkClass}
            >
              <span>{tLinks('accounts')}</span>
            </Link>
            <Link
              href="/app/settings"
              onClick={handleClose}
              data-testid="more-sheet-link-settings"
              className={linkClass}
            >
              <span>{tLinks('settings')}</span>
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={handleClose}
                data-testid="more-sheet-link-admin"
                aria-label={tLinks('adminAriaLabel')}
                className={linkClass}
              >
                <span>{tLinks('admin')}</span>
                {/* Same amber-700 marker as Header.tsx / HeaderNav.tsx — WCAG
                    SC 1.4.11 contrast ≥ 3:1 in both themes. */}
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-700"
                />
              </Link>
            )}
          </section>

          <section aria-labelledby="more-section-resources" className="space-y-1">
            <h3
              id="more-section-resources"
              className="text-muted-foreground px-3 text-[11px] font-medium tracking-wider uppercase"
            >
              {tSections('resources')}
            </h3>
            <Link
              href="/faq"
              onClick={handleClose}
              data-testid="more-sheet-link-faq"
              className={linkClass}
            >
              <span>{tLinks('faq')}</span>
            </Link>
            <Link
              href="/glossaire"
              onClick={handleClose}
              data-testid="more-sheet-link-glossary"
              className={linkClass}
            >
              <span>{tLinks('glossary')}</span>
            </Link>
            <Link
              href="/legal/cgu"
              onClick={handleClose}
              data-testid="more-sheet-link-legal-cgu"
              className={linkClass}
            >
              <span>{tLinks('legalCgu')}</span>
            </Link>
            <Link
              href="/legal/privacy"
              onClick={handleClose}
              data-testid="more-sheet-link-legal-privacy"
              className={linkClass}
            >
              <span>{tLinks('legalPrivacy')}</span>
            </Link>
            <Link
              href="/legal/cookies"
              onClick={handleClose}
              data-testid="more-sheet-link-legal-cookies"
              className={linkClass}
            >
              <span>{tLinks('legalCookies')}</span>
            </Link>
          </section>

          <section aria-labelledby="more-section-preferences" className="space-y-2">
            <h3
              id="more-section-preferences"
              className="text-muted-foreground px-3 text-[11px] font-medium tracking-wider uppercase"
            >
              {tSections('preferences')}
            </h3>
            <button
              type="button"
              onClick={toggleTheme}
              data-testid="more-sheet-theme-toggle"
              className="bg-surface-muted text-foreground hover:bg-surface-muted/80 focus-visible:ring-brand-600 flex w-full items-center justify-between rounded-md px-3 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label={isDark ? tLinks('lightMode') : tLinks('darkMode')}
            >
              <span className="dark:hidden">{tLinks('darkMode')}</span>
              <span className="hidden dark:block">{tLinks('lightMode')}</span>
              <div className="h-4 w-4">
                <Moon className="h-4 w-4 dark:hidden" aria-hidden="true" />
                <Sun className="hidden h-4 w-4 dark:block" aria-hidden="true" />
              </div>
            </button>
            <div className="px-3 py-1">
              <LocaleSwitcher />
            </div>
          </section>

          <section aria-labelledby="more-section-account" className="space-y-1">
            <h3
              id="more-section-account"
              className="text-muted-foreground px-3 text-[11px] font-medium tracking-wider uppercase"
            >
              {tSections('account')}
            </h3>
            <form action={logoutAction}>
              <button
                type="submit"
                data-testid="more-sheet-logout"
                className="text-foreground hover:bg-muted focus-visible:ring-brand-600 flex w-full items-center justify-between rounded-md px-3 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <span>{tLinks('logout')}</span>
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );

  return createPortal(node, document.body);
}
