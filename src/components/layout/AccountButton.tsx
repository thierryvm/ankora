'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut, Settings } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { logoutAction } from '@/lib/actions/auth';

/**
 * AccountButton (PR-A) — persistent account menu for authenticated visitors
 * on tablet + desktop (`hidden md:flex`). Resolves "no way to log out from
 * the chrome": before this, `logoutAction` was rendered ONLY in the mobile
 * `MoreSheet` (`md:hidden`), so desktop/tablet sessions had no logout at all.
 * Mobile (< 768px) stays served by the BottomTabBar + MoreSheet (THI-277),
 * hence `md:flex` here keeps the two surfaces mutually exclusive.
 *
 * Three deliberate deviations from the original spec, each code-verified:
 *
 * 1. NO `Avatar` atom. `Avatar.tsx` tints the tile with inline `style={{…}}`
 *    (color-mix). The prod CSP is `style-src 'self' 'nonce-…'` with no
 *    `'unsafe-inline'` (proxy.ts) → inline `style` attributes are blocked,
 *    and `Avatar` is only ever exercised in `design-playground` (never on a
 *    CSP-enforced surface). The avatar here is Tailwind classes only.
 *
 * 2. NO portal (unlike MoreSheet). An anchored dropdown needs runtime
 *    positioning, which would require an inline `style` — blocked by the same
 *    CSP. An `absolute` Tailwind-positioned panel is CSP-safe. Trade-off: the
 *    panel lives inside the sticky `backdrop-blur` header stacking context;
 *    verified above page content on desktop, flagged for the iPad-Safari
 *    live-test (the WebKit stacking quirk that forced MoreSheet to portal).
 *
 * 3. Hand-rolled disclosure (no shadcn DropdownMenu — none exists in
 *    `src/components/ui/`, adding one is out of scope / budget 0 €). Full
 *    APG menu semantics: `role="menu"` + `menuitem`, arrow-key navigation,
 *    Tab focus-trap, Escape + focus restore, outside-click dismiss.
 */

/** Derive up to 2 uppercase letters from the local-part of the email. */
function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const cleaned = local.replace(/[^\p{L}\p{N}]/gu, '');
  const base = cleaned.slice(0, 2) || email.slice(0, 1) || '?';
  return base.toUpperCase();
}

export function AccountButton({ email }: { email: string }) {
  const t = useTranslations('common');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initials = initialsFromEmail(email);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    // Move focus into the menu on open (first item).
    const items = () => panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [];
    items()[0]?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }

      const list = Array.from(items());
      if (list.length === 0) return;
      const activeIndex = list.indexOf(document.activeElement as HTMLElement);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        list[(activeIndex + 1) % list.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        list[(activeIndex - 1 + list.length) % list.length]?.focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        list[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        list[list.length - 1]?.focus();
      } else if (event.key === 'Tab') {
        // APG menu pattern: Tab dismisses the menu rather than trapping focus.
        // Close and return focus to the trigger so the next Tab proceeds
        // naturally through the page from a deterministic anchor.
        event.preventDefault();
        close();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, close]);

  return (
    <div ref={containerRef} className="relative hidden md:flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={t('account.menuAria')}
        data-testid="account-button"
        // Focus indicator = the global `*:focus-visible` outline (globals.css).
        // Per the THI-298 doctrine, non-field controls keep that outline rather
        // than stacking a second Tailwind ring on top of it (the global rule is
        // non-layered and wins over the utility anyway).
        className="flex h-11 w-11 items-center justify-center rounded-full"
      >
        <span
          aria-hidden="true"
          className="bg-brand-700 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
        >
          {initials}
        </span>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          data-testid="account-menu"
          className="border-border bg-card absolute top-full right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border shadow-lg"
        >
          <div className="border-border border-b px-3 py-2.5">
            <p className="text-muted-foreground text-[11px]">{t('account.signedInAs')}</p>
            <p className="text-foreground truncate text-sm font-medium" title={email}>
              {email}
            </p>
          </div>

          <div className="p-1">
            <Link
              href="/app/settings"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              data-testid="account-menu-settings"
              className="text-foreground hover:bg-surface-muted flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span>{t('nav.settings')}</span>
            </Link>

            <form action={logoutAction}>
              <button
                type="submit"
                role="menuitem"
                data-testid="account-menu-logout"
                className="text-foreground hover:bg-surface-muted flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>{t('account.logout')}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
