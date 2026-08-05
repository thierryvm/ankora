import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { routing } from '@/i18n/routing';
import { INDEXABLE_LOCALES as SEO_INDEXABLE_LOCALES } from '@/lib/seo/indexable-locales';
import { GLOSSARY_LOCALES, getGlossaryTerms, GLOSSARY_LOCALE_PREFIXES } from '@/lib/glossary';

/**
 * Routes worth submitting for indexing.
 *
 * `/legal/*` is deliberately absent: those pages set
 * `robots: { index: false, follow: true }`, so submitting them made Search
 * Console report "Submitted URL marked noindex" on 15 URLs (3 pages × 5
 * locales) — a self-inflicted error report, not a ranking opportunity.
 */
const PUBLIC_ROUTES = ['', '/faq'] as const;

/**
 * Locales the sitemap advertises.
 *
 * `LOCALES_VISIBLE` (FR + EN), not `routing.locales`. `nl-BE`, `de-DE` and
 * `es-ES` resolve — deep links and QA bookmarks keep working — but their
 * `landing.*` copy is still French verbatim, so submitting them asks Google to
 * index untranslated pages under a Dutch/German/Spanish URL. The glossary
 * already scopes itself this way through `GLOSSARY_LOCALES`; this aligns the
 * rest. Add a locale back here once its translation is reviewed.
 */
const INDEXABLE_LOCALES = SEO_INDEXABLE_LOCALES;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = SITE.url;

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of INDEXABLE_LOCALES) {
    const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;
    for (const route of PUBLIC_ROUTES) {
      entries.push({
        url: `${base}${prefix}${route}`,
        lastModified: now,
        changeFrequency: route === '' ? 'weekly' : 'monthly',
        priority: route === '' ? 1 : 0.6,
        alternates: {
          languages: Object.fromEntries(
            INDEXABLE_LOCALES.map((l) => [
              l,
              `${base}${l === routing.defaultLocale ? '' : `/${l}`}${route}`,
            ]),
          ),
        },
      });
    }
  }

  // Glossary index entries (3 locales)
  for (const locale of GLOSSARY_LOCALES) {
    const prefix = GLOSSARY_LOCALE_PREFIXES[locale];
    entries.push({
      url: `${base}${prefix}/glossaire`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
      alternates: {
        languages: Object.fromEntries(
          GLOSSARY_LOCALES.map((l) => [l, `${base}${GLOSSARY_LOCALE_PREFIXES[l]}/glossaire`]),
        ),
      },
    });
  }

  // Glossary term entries (3 locales × 15 terms)
  for (const locale of GLOSSARY_LOCALES) {
    const prefix = GLOSSARY_LOCALE_PREFIXES[locale];
    const terms = getGlossaryTerms(locale);
    for (const term of terms) {
      entries.push({
        url: `${base}${prefix}/glossaire/${term.slug}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.7,
        alternates: {
          languages: Object.fromEntries(
            GLOSSARY_LOCALES.map((l) => [
              l,
              `${base}${GLOSSARY_LOCALE_PREFIXES[l]}/glossaire/${term.slug}`,
            ]),
          ),
        },
      });
    }
  }

  return entries;
}
