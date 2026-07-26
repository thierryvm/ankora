import { describe, it, expect } from 'vitest';

import sitemap from '@/app/sitemap';
import { GLOSSARY_LOCALES } from '@/lib/glossary';
import { LOCALES_VISIBLE, routing } from '@/i18n/routing';

/**
 * Sitemap invariants.
 *
 * Two defects motivated these, both found by `seo-geo-auditor` and both silent:
 * nothing failed, Search Console simply reported errors weeks later.
 *
 *   1. The three `/legal/*` pages set `robots: { index: false }` yet were
 *      submitted for all five locales — 15 URLs guaranteed to come back as
 *      "Submitted URL marked noindex".
 *   2. `nl-BE`, `de-DE` and `es-ES` were submitted for the marketing routes
 *      while their `landing.*` copy is still French verbatim, asking Google to
 *      index untranslated pages under a localised URL.
 *
 * The glossary is the deliberate exception: `GLOSSARY_LOCALES` scopes it to the
 * three locales whose terms are actually translated, `nl-BE` included. That
 * asymmetry is intended — do not "align" it without checking the content first.
 */

const urls = () => sitemap().map((entry) => entry.url);
const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/, '') || '/';

describe('sitemap — never submits what robots forbid', () => {
  it('excludes the noindex legal pages entirely', () => {
    const legal = urls().filter((url) => pathOf(url).includes('/legal/'));
    expect(
      legal,
      'these pages set robots.index=false — submitting them only produces Search Console errors',
    ).toEqual([]);
  });
});

describe('sitemap — only advertises locales that are actually translated', () => {
  it('limits the marketing routes to the visible locales', () => {
    const untranslated = routing.locales.filter(
      (locale) => !(LOCALES_VISIBLE as readonly string[]).includes(locale),
    );

    const offending = urls().filter((url) => {
      const path = pathOf(url);
      // The glossary has its own, deliberately wider, locale scope.
      if (path.includes('/glossaire')) return false;
      return untranslated.some((locale) => path === `/${locale}` || path.startsWith(`/${locale}/`));
    });

    expect(offending, 'marketing copy is French verbatim in these locales').toEqual([]);
  });

  it('keeps the glossary on its own translated scope', () => {
    const glossary = urls().filter((url) => pathOf(url).includes('/glossaire'));
    expect(glossary.length).toBeGreaterThan(0);

    const outOfScope = glossary.filter((url) => {
      const path = pathOf(url);
      return routing.locales.some(
        (locale) =>
          path.startsWith(`/${locale}/`) &&
          !(GLOSSARY_LOCALES as readonly string[]).includes(locale),
      );
    });

    expect(outOfScope, 'a glossary URL in a locale with no translated terms').toEqual([]);
  });
});

describe('sitemap — shape', () => {
  it('emits no duplicate URLs', () => {
    const all = urls();
    expect(new Set(all).size).toBe(all.length);
  });

  it('advertises alternates only for locales it actually submits', () => {
    const submitted = new Set(urls());
    const dangling = sitemap().flatMap((entry) =>
      Object.values(entry.alternates?.languages ?? {}).filter(
        (href): href is string => typeof href === 'string' && !submitted.has(href),
      ),
    );

    expect(
      [...new Set(dangling)],
      'hreflang pointing at a URL absent from the sitemap sends mixed signals',
    ).toEqual([]);
  });
});
