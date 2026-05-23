'use client';

import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition, type ChangeEvent } from 'react';

import { useRouter, usePathname } from '@/i18n/navigation';
import { LOCALES_VISIBLE, type Locale } from '@/i18n/routing';
import { setLocaleAction } from '@/lib/actions/locale';

/**
 * Marketing + cockpit header locale switcher.
 *
 * Renders only the locales listed in `LOCALES_VISIBLE` (FR-BE + EN for v1.0
 * Beta per CLAUDE.md doctrine). The wider `LOCALES` set remains the source
 * of truth for the next-intl middleware and request handler, so deep-links
 * like `/nl-BE/...` keep resolving — they are simply hidden from the user
 * until each locale ships with a validated native review.
 *
 * THI-252 / THI-255 Phase A (2026-05-23): while the locale change is in
 * flight the `<select>` is disabled and a small `Loader2` spinner is
 * shown to acknowledge the action. `aria-busy` + a visually-hidden
 * `role="status"` text node announce the state to assistive tech. Phase B
 * (follow-up PR) will tackle the architectural drawer-stay-open + the
 * `< 500 ms` propagation budget (cf. audit perf THI-243 RC #2 / #4).
 */
export function LocaleSwitcher() {
  const t = useTranslations('ui.localeSwitcher');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as Locale;
    startTransition(async () => {
      await setLocaleAction(next);
      router.replace(pathname, { locale: next });
      router.refresh();
    });
  }

  return (
    <label className="text-muted-foreground inline-flex items-center gap-2 text-xs">
      <span className="sr-only">{t('label')}</span>
      <span className="inline-flex items-center gap-2">
        <select
          value={locale}
          onChange={onChange}
          disabled={pending}
          aria-busy={pending}
          aria-label={t('aria')}
          className="border-border bg-background text-foreground focus-visible:ring-brand-600 rounded-md border px-2 py-1 text-xs focus-visible:ring-2 focus-visible:outline-none disabled:cursor-progress disabled:opacity-60"
        >
          {LOCALES_VISIBLE.map((code) => (
            <option key={code} value={code}>
              {t(`options.${code}`)}
            </option>
          ))}
        </select>
        {pending && (
          <Loader2
            aria-hidden="true"
            data-testid="locale-switching-spinner"
            className="text-brand-600 h-3 w-3 animate-spin"
          />
        )}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? t('switching') : ''}
      </span>
    </label>
  );
}
