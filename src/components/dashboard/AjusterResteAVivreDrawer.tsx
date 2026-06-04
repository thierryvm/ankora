'use client';

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { updateResteAVivreOverrideAction } from '@/lib/actions/reste-a-vivre';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type Props = {
  currentMonthYYYYMM: string;
  initialResteAVivre: number;
  monthlyIncome: number | null;
  triggerLabel?: string;
};

/**
 * PR-BETA-3 (THI-267) — "Ajuster ce mois" drawer.
 *
 * Slide-in panel that lets the user override the reste-à-vivre for the
 * current month. The drawer reuses the same visual idiom as the EditDrawer
 * atom (slide-from-right on desktop, full-screen on mobile) but stays
 * standalone because it needs the adaptive helper text — a per-field rule
 * the generic EditDrawer doesn't model.
 *
 * R-06 anti-culpabilisation contract: helper text never says "you spend too
 * much" or "you should save X €". It either confirms the estimate is
 * coherent, low, or high, without judgement.
 */
export function AjusterResteAVivreDrawer({
  currentMonthYYYYMM,
  initialResteAVivre,
  monthlyIncome,
  triggerLabel,
}: Props) {
  const t = useTranslations('dashboard.capacite');
  const translateError = useActionErrorTranslator();
  const router = useRouter();
  const inputId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [open, setOpen] = useState(false);
  const [draftStr, setDraftStr] = useState(formatInitialAmount(initialResteAVivre));
  const [isPending, startTransition] = useTransition();

  // Autofocus the input when the drawer opens. The draft state is reset
  // imperatively in `openDrawer()` (not via an effect) to avoid the
  // cascading-render anti-pattern flagged by react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  function openDrawer() {
    setDraftStr(formatInitialAmount(initialResteAVivre));
    setOpen(true);
  }

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Lock body scroll when open (mobile fullscreen UX).
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // WCAG 2.4.3 — return focus to the trigger whenever the drawer closes
  // (covers ESC, backdrop, X, cancel, and submit-success paths uniformly).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
    wasOpen.current = open;
  }, [open]);

  const parsedDraft = useMemo(() => {
    const cleaned = draftStr.replace(',', '.').trim();
    const num = Number(cleaned);
    if (cleaned === '' || !Number.isFinite(num) || num < 0 || num > 100000) {
      return null;
    }
    return num;
  }, [draftStr]);

  const adaptiveHelper = useMemo(() => {
    if (parsedDraft === null || !monthlyIncome || monthlyIncome <= 0) {
      return t('drawer.helperCoherent');
    }
    const ratio = parsedDraft / monthlyIncome;
    if (ratio < 0.15) return t('drawer.helperBas');
    if (ratio > 0.5) return t('drawer.helperHaut');
    return t('drawer.helperCoherent');
  }, [parsedDraft, monthlyIncome, t]);

  function submit() {
    if (parsedDraft === null) {
      inputRef.current?.focus();
      return;
    }
    startTransition(async () => {
      // PR-BETA-3 hotfix 2026-05-26 — defensive error handling.
      // Three failure modes are now surfaced as a visible toast (fail-loud):
      //   1. Server Action returns `{ ok: false, errorCode }` — translate
      //      via the i18n action-errors helper.
      //   2. Server Action throws (network down, Vercel infra blip, …)
      //      — show the generic drawer error toast.
      // In every failure path the drawer stays OPEN so the user can retry
      // without re-tapping the trigger and re-entering their amount.
      try {
        const result = await updateResteAVivreOverrideAction({
          monthYYYYMM: currentMonthYYYYMM,
          montant: parsedDraft,
        });
        if (result.ok) {
          toast.success(t('drawer.success'));
          setOpen(false);
          router.refresh();
        } else {
          toast.error(translateError(result.errorCode) || t('drawer.errorGeneric'));
        }
      } catch (err) {
        // PR-BETA-3 hotfix #3 — Next.js implements `redirect()` and
        // `notFound()` via thrown sentinel errors that the framework
        // intercepts to perform navigation. Catching them here (as the
        // previous hotfix did) silently swallowed the auth bounce thrown
        // by `requireUserWithWorkspace()` server-side: the user saw a
        // generic "couldn't save" toast instead of being redirected to
        // `/login`. Re-throw so React + Next.js can complete the bounce.
        if (isNextControlFlowError(err)) throw err;
        // Log to the browser console so the user can copy-paste it for a
        // bug report; the toast keeps the UX recoverable.
        // eslint-disable-next-line no-console
        console.error('updateResteAVivreOverrideAction threw', err);
        toast.error(t('drawer.errorGeneric'));
      }
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDrawer}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-700 inline-flex min-h-11 items-center gap-1 rounded-md px-2 py-0.5 text-xs underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
        data-testid="reste-a-vivre-trigger"
        aria-label={triggerLabel ?? t('subStats.ajusterCeMois')}
      >
        <Pencil className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        <span>{triggerLabel ?? t('subStats.ajusterCeMois')}</span>
      </button>

      {open && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="reste-a-vivre-drawer"
        >
          <button
            type="button"
            aria-label={t('drawer.cancel')}
            className="bg-foreground/40 absolute inset-0 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside
            className={cn(
              'bg-card text-foreground border-border relative flex w-full flex-col border shadow-xl',
              // Mobile: full-screen, slide from bottom (iOS Settings pattern).
              'h-dvh max-h-dvh',
              // Desktop: slide from right, fixed width.
              'sm:h-full sm:max-w-md sm:border-l',
            )}
          >
            <header className="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {t('drawer.title')}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-700 -mr-1 rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none"
                aria-label={t('drawer.cancel')}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-6">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={inputId} className="text-sm font-medium">
                  {t('drawer.inputLabel')}
                </label>
                <p className="text-muted-foreground text-xs">{t('drawer.inputHint')}</p>
              </div>

              <div className="relative">
                <input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draftStr}
                  onChange={(e) => setDraftStr(e.target.value.replace(/[^0-9.,]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  className="border-border bg-background focus-visible:ring-brand-700 w-full rounded-md border px-3 py-3 pr-10 text-2xl font-semibold tabular-nums focus-visible:ring-2 focus-visible:outline-none"
                  aria-describedby={`${inputId}-helper`}
                  data-testid="reste-a-vivre-input"
                />
                <span
                  className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-base"
                  aria-hidden
                >
                  €
                </span>
              </div>

              <p
                id={`${inputId}-helper`}
                className="text-muted-foreground text-sm leading-relaxed"
                data-testid="reste-a-vivre-helper"
              >
                {adaptiveHelper}
              </p>
            </div>

            <footer className="border-border bg-card flex items-center justify-end gap-2 border-t px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-foreground hover:bg-muted focus-visible:ring-brand-700 rounded-md border border-transparent px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
                disabled={isPending}
              >
                {t('drawer.cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                className="bg-brand-700 hover:bg-brand-800 focus-visible:ring-brand-700 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending || parsedDraft === null}
                data-testid="reste-a-vivre-save"
              >
                {t('drawer.save')}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}

/**
 * PR-BETA-CLEANUP-3 (2026-05-27) — Drop the trailing ".00" when the user's
 * current value is already an integer. The previous `toFixed(2)` rendering
 * surfaced "500.00" in the input on initial open, which @thierry flagged
 * as visual noise (Belgian users don't write decimals on round euros).
 *
 * Contract:
 *   - Integer values (500, 0, 1234) → "500", "0", "1234"
 *   - Fractional values stay at 2 decimals → "425.50", "162.34"
 *   - NaN / non-finite → "0" (defensive; should never happen since callers
 *     pass `Decimal.toNumber()`)
 *
 * Does NOT touch `formatCurrency()` which the rest of the dashboard relies
 * on for the "1 234,56 €" locale-aware display. This helper is INPUT-only:
 * the value lives in an `<input type="text" inputMode="decimal">` that
 * accepts user-typed digits with comma or dot, so we render with a dot
 * (the form parser already normalises `.` and `,`).
 */
function formatInitialAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
