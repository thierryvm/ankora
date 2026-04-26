import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { routing } from '@/i18n/routing';

const AI_BOTS_ALLOW_PUBLIC = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
  'Amazonbot',
] as const;

const AI_BOTS_ALLOW_ALL = ['ChatGPT-User', 'PerplexityBot'] as const;

const AI_BOTS_BLOCKED = ['Bytespider'] as const;

export default function robots(): MetadataRoute.Robots {
  // With `localePrefix: 'as-needed'`, the default locale exposes paths at root
  // (e.g. /app) while other locales are prefixed (e.g. /nl-BE/app). Disallow the
  // authenticated app surface for both shapes.
  const disallowBase = ['/app/', '/api/', '/auth/', '/onboarding/', '/_next/'];
  const localizedDisallow = routing.locales
    .filter((l) => l !== routing.defaultLocale)
    .flatMap((l) => [`/${l}/app/`, `/${l}/auth/`, `/${l}/onboarding/`]);

  const rules: MetadataRoute.Robots['rules'] = [
    {
      userAgent: '*',
      allow: ['/'],
      disallow: [...disallowBase, ...localizedDisallow],
    },
    ...AI_BOTS_ALLOW_PUBLIC.map((ua) => ({
      userAgent: ua,
      allow: ['/'],
      disallow: [...disallowBase, ...localizedDisallow],
    })),
    ...AI_BOTS_ALLOW_ALL.map((ua) => ({
      userAgent: ua,
      allow: ['/'],
    })),
    ...AI_BOTS_BLOCKED.map((ua) => ({
      userAgent: ua,
      disallow: ['/'],
    })),
  ];

  return {
    rules,
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
