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
});
