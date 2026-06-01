'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRef, useTransition, type KeyboardEvent } from 'react';

import { useRouter, usePathname } from '@/i18n/navigation';
import { LOCALES_VISIBLE, type Locale } from '@/i18n/routing';
import { setLocaleAction } from '@/lib/actions/locale';

/**
 * Language switch — iOS-style segmented control (FR | EN).
 *
 * Replaces the native `<select>` (@thierry 2026-06-01): the native control
 * rendered an unbranded OS dropdown and, when focused, the global
 * `*:focus-visible` outline drew an oversized box around the whole field.
 * With only two visible locales (`LOCALES_VISIBLE` = fr-BE + EN for v1.0) a
 * segmented toggle is the cleaner 2026 pattern — no dropdown, no oversized
 * border. The wider `LOCALES` set still backs the next-intl middleware so
 * deep links like `/nl-BE/...` keep resolving; they are just hidden here.
 *
 * Visible label = the short code (FR / EN); the full locale name stays the
 * accessible name via `aria-label`. CSP-safe (Tailwind only, no inline
 * style). a11y: `radiogroup` + `radio` + `aria-checked`; Arrow keys move
 * focus between segments WITHOUT auto-switching — selection does NOT follow
 * focus because the switch triggers a navigation, so it is activated
 * explicitly via click / Enter / Space (APG note for radio groups whose
 * selection has consequences).
 *
 * Both segments are tab-stops (`tabIndex={0}`), NOT a roving tabindex. A
 * roving tabindex would set the inactive segment to `tabindex="-1"`, which the
 * surrounding drawer focus-traps (`HeaderNav` + `MoreSheet`, which render this
 * switcher) count as the "last focusable" via their bare `button` selector yet
 * the browser skips on Tab — so the trap's wrap-around never fires and focus
 * escapes the drawer (e2e `drawer-mobile-focus-trap`). Two tab-stops keep the
 * trap's element list consistent with real Tab order.
 *
 * Switch side-effects unchanged from the previous `<select>`: persist the
 * locale (cookie + DB via `setLocaleAction`) then `router.replace(pathname,
 * { locale })`. In `localePrefix: 'as-needed'` the pathname change alone
 * re-renders the Server Components — no `router.refresh()` (THI-266 history:
 * the refresh was redundant + closed the mobile drawer mid-switch).
 */
export function LocaleSwitcher() {
  const t = useTranslations('ui.localeSwitcher');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const groupRef = useRef<HTMLDivElement>(null);

  function switchTo(next: Locale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.replace(pathname, { locale: next });
    });
  }

  // Roving focus between segments. Selection does not follow focus (the
  // switch navigates), so arrows only move focus — activation is explicit.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const radios = Array.from(
      groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
    );
    if (radios.length === 0) return;
    const current = radios.findIndex((radio) => radio === document.activeElement);
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const nextIndex =
      current === -1 ? 0 : (current + (forward ? 1 : -1) + radios.length) % radios.length;
    radios[nextIndex]?.focus();
  }

  return (
    <>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={t('aria')}
        aria-busy={pending}
        onKeyDown={onKeyDown}
        data-testid="locale-switcher"
        className="bg-surface-muted inline-flex items-center rounded-full p-0.5 text-xs"
      >
        {LOCALES_VISIBLE.map((code) => {
          const isActive = code === locale;
          const short = code.split('-')[0]?.toUpperCase() ?? code.toUpperCase();
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={t(`options.${code}`)}
              tabIndex={0}
              disabled={pending}
              onClick={() => switchTo(code)}
              data-testid={`locale-option-${code}`}
              className={[
                // min-h-11 (44px) = Apple HIG / WCAG 2.5.5 touch target, aligned
                // with the AccountButton trigger. `focus-visible:rounded-full`
                // makes the global focus outline follow the pill shape.
                'inline-flex min-h-11 items-center justify-center rounded-full px-3.5 transition-colors focus-visible:rounded-full disabled:cursor-progress',
                isActive
                  ? // Active state. bg-card vs the surface-muted track is only
                    // ~1.03:1 in dark, so the fill can't carry the state alone:
                    // a brand-600 (teal) ring + font-semibold make the active
                    // segment unmistakable in BOTH themes (≥3:1, WCAG 1.4.11)
                    // while reading as the brand "selected" colour.
                    'bg-card text-foreground ring-brand-600 font-semibold shadow-sm ring-1'
                  : 'text-muted-foreground hover:text-foreground font-medium',
              ].join(' ')}
            >
              {short}
            </button>
          );
        })}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? t('switching') : ''}
      </span>
    </>
  );
}
