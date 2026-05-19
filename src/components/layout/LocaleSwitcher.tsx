'use client';

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
      <select
        value={locale}
        onChange={onChange}
        disabled={pending}
        aria-label={t('aria')}
        className="border-border bg-background text-foreground focus-visible:ring-brand-600 rounded-md border px-2 py-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
      >
        {LOCALES_VISIBLE.map((code) => (
          <option key={code} value={code}>
            {t(`options.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
