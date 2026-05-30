'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SimulatorClient, type RawCharge } from '@/app/[locale]/app/simulator/SimulatorClient';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  charges: RawCharge[];
  /**
   * Monthly income as a raw `number` (not a `Decimal`). A Decimal loses its
   * prototype crossing the RSC boundary into this client component, so the
   * server passes the plain number and `SimulatorClient` re-wraps it.
   */
  revenus: number;
};

/**
 * THI-195 — What-if simulator drawer (3rd essential Beta cockpit section).
 *
 * Surfaces the existing `SimulatorClient` calculator in-page from the
 * dashboard, without navigating away. The standalone `/app/simulator`
 * route is preserved as a fallback (SEO + direct link).
 *
 * Home-grown drawer pattern (no `vaul` dependency — budget 0 €), mirroring
 * the proven idiom of `AjusterResteAVivreDrawer` / `ChargeEditDrawer`:
 *   - mobile: full-screen, slide from bottom (iOS Settings pattern)
 *   - desktop (≥640px): slide from right, fixed 28rem width
 *   - ESC closes, backdrop closes, body scroll lock while open
 *
 * a11y hardening beyond the sibling drawers (WCAG 2.4.3 / 4.1.2 — a modal
 * `aria-modal` dialog MUST contain focus):
 *   - Tab / Shift+Tab cycle is trapped inside the panel
 *   - on close (ESC, backdrop, X, save), focus returns to the trigger
 *
 * No re-fetch on open: `charges` is passed down from the dashboard server
 * component (`snapshot.rawCharges`), already in memory.
 */
export function SimulatorDrawer({ charges, revenus }: Props) {
  const t = useTranslations('app.dashboard');
  const tSimulator = useTranslations('app.simulator');
  const tClose = useTranslations('ui.action');
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the trigger once the drawer unmounts (rAF defers past
    // the unmount commit). Keeps keyboard users anchored where they started.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Lock body scroll while open (mobile full-screen UX). iOS Safari ignores
  // `overflow: hidden` on <body> for rubber-band scroll, so we pin the body
  // with `position: fixed` and restore the scroll offset on close — the same
  // ITP-safe pattern already used by `MoreSheet`.
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const { scrollY } = window;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';
      body.style.overflow = '';
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
    };
  }, [open]);

  // Auto-focus the first focusable element in the panel when opened, and
  // trap Tab / Shift+Tab within the panel (focus containment).
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const getFocusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const focusId = requestAnimationFrame(() => {
      const focusable = getFocusable();
      (focusable[0] ?? panel).focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(focusId);
      panel.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="lg"
        onClick={() => setOpen(true)}
        data-testid="simulator-drawer-trigger"
      >
        {t('ctaSimulator')}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
          <button
            type="button"
            aria-label={tClose('close')}
            className="bg-foreground/40 absolute inset-0 backdrop-blur-sm"
            onClick={close}
            data-testid="simulator-drawer-backdrop"
          />
          {/* The dialog role lives on the panel itself (not the overlay), so
              the backdrop button is NOT announced as dialog content and the
              landmark tree stays clean (a plain <div>, not an <aside>). */}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid="simulator-drawer"
            className={cn(
              'bg-card text-foreground border-border relative flex w-full flex-col border shadow-xl',
              // Mobile: full-screen, slide from bottom.
              'h-dvh max-h-dvh',
              // Desktop: slide from right, fixed width.
              'sm:h-full sm:max-w-md sm:border-l',
            )}
          >
            <header className="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {tSimulator('title')}
              </h2>
              <button
                type="button"
                onClick={close}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-700 -mr-1 rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none"
                aria-label={tClose('close')}
                data-testid="simulator-drawer-close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            {/* `pb-safe`: reserve the iOS home-indicator inset so the last
                result card is never hidden behind it on a full-screen PWA. */}
            <div className="flex-1 overflow-y-auto px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <SimulatorClient hideHeader charges={charges} revenus={revenus} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
