'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition, type ChangeEvent } from 'react';

import { useRouter, usePathname } from '@/i18n/navigation';
import { LOCALES, type Locale } from '@/i18n/routing';
import { setLocaleAction } from '@/lib/actions/locale';

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
    <label className="inline-flex items-center gap-2 text-xs text-(--color-muted-foreground)">
      <span className="sr-only">{t('label')}</span>
      <select
        value={locale}
        onChange={onChange}
        disabled={pending}
        aria-label={t('aria')}
        className="rounded-md border border-(--color-border) bg-(--color-background) px-2 py-1 text-xs text-(--color-foreground) focus-visible:ring-2 focus-visible:ring-(--color-brand-600) focus-visible:outline-none"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`options.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
