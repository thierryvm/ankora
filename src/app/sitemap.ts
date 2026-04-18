import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { routing } from '@/i18n/routing';

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

  return entries;
}
