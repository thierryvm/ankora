import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { routing } from '@/i18n/routing';
import { GLOSSARY_LOCALES, getGlossaryTerms, GLOSSARY_LOCALE_PREFIXES } from '@/lib/glossary';

const PUBLIC_ROUTES = ['', '/faq', '/legal/cgu', '/legal/privacy', '/legal/cookies'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = SITE.url;

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;
    for (const route of PUBLIC_ROUTES) {
      entries.push({
        url: `${base}${prefix}${route}`,
        lastModified: now,
        changeFrequency: route === '' ? 'weekly' : 'monthly',
        priority: route === '' ? 1 : 0.6,
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((l) => [
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
