import { describe, it, expect } from 'vitest';

import { LOCALES, DEFAULT_LOCALE, routing } from '@/i18n/routing';

describe('i18n routing', () => {
  it('exposes the 5 supported BCP 47 locales', () => {
    expect(LOCALES).toEqual(['fr-BE', 'nl-BE', 'en', 'es-ES', 'de-DE']);
  });

  it('uses fr-BE as the default locale', () => {
    expect(DEFAULT_LOCALE).toBe('fr-BE');
    expect(routing.defaultLocale).toBe('fr-BE');
  });

  it('is configured with localePrefix "as-needed"', () => {
    expect(routing.localePrefix).toBe('as-needed');
  });

  it('declares all locales in the routing config', () => {
    expect(routing.locales).toEqual(LOCALES);
  });

  // Config lock. Both flags are load-bearing and only make sense together:
  // re-enabling `localeCookie` brings back the cookie-rewrite race that made
  // the language silently revert to English, and re-enabling `localeDetection`
  // makes `Accept-Language` the sole detector, which puts French out of reach
  // for non-French browsers. A silent revert of either is a production bug, so
  // it must break the build. Cf. the long note in `src/i18n/routing.ts`.
  it('keeps locale resolution driven by the URL prefix alone', () => {
    expect(routing.localeCookie, 'next-intl must not manage NEXT_LOCALE').toBe(false);
    expect(routing.localeDetection, 'Accept-Language must not pick the locale').toBe(false);
  });
});
