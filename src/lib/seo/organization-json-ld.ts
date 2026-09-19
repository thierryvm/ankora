import { brand } from '@/lib/brand';
import { SITE } from '@/lib/site';

/**
 * The single `Organization` of the site, rendered by the locale layout on
 * every page.
 *
 * Built here rather than inline so it can be tested: the landing page already
 * carries `SoftwareApplication` and `FAQPage`, and a second `Organization`
 * there would declare the publisher twice. The contact address comes from
 * `brand.ts`, like every other public contact; the address stops at the city,
 * which is all the publisher makes public.
 */
export function buildOrganizationJsonLd(description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/brand/logo.svg`,
    description,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: brand.contactEmail,
      availableLanguage: ['fr', 'en'],
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Bruxelles',
      addressCountry: 'BE',
    },
  } as const;
}
