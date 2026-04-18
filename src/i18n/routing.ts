import { defineRouting } from 'next-intl/routing';

export const LOCALES = ['fr-BE', 'nl-BE', 'en', 'es-ES', 'de-DE'] as const;
export const DEFAULT_LOCALE = 'fr-BE';

export type Locale = (typeof LOCALES)[number];

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
});
