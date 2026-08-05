import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { routing } from '@/i18n/routing';
import { INDEXABLE_LOCALES } from '@/lib/seo/indexable-locales';
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

// Les locales que le sitemap soumet — cf. `@/lib/seo/indexable-locales`, qui
// porte la liste et la raison, et que `[locale]/layout.tsx` lit aussi.

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
