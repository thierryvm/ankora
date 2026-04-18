import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { routing } from '@/i18n/routing';

export default function robots(): MetadataRoute.Robots {
  // With `localePrefix: 'as-needed'`, the default locale exposes paths at root
  // (e.g. /app) while other locales are prefixed (e.g. /nl-BE/app). Disallow the
  // authenticated app surface for both shapes.
  const disallowBase = ['/app/', '/api/', '/auth/', '/onboarding/', '/_next/'];
  const localizedDisallow = routing.locales
    .filter((l) => l !== routing.defaultLocale)
    .flatMap((l) => [`/${l}/app/`, `/${l}/auth/`, `/${l}/onboarding/`]);

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: [...disallowBase, ...localizedDisallow],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
