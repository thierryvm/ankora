import frBE from '../../content/glossary/fr-BE.json';
import nlBE from '../../content/glossary/nl-BE.json';
import en from '../../content/glossary/en.json';

export type GlossaryTerm = {
  slug: string;
  term: string;
  shortDefinition: string;
  whyItMatters: string;
  example: string;
  relatedTerms: string[];
};

export const GLOSSARY_LOCALES = ['fr-BE', 'nl-BE', 'en'] as const;
export type GlossaryLocale = (typeof GLOSSARY_LOCALES)[number];

export const GLOSSARY_LOCALE_PREFIXES: Record<GlossaryLocale, string> = {
  'fr-BE': '',
  'nl-BE': '/nl-BE',
  en: '/en',
};

const GLOSSARY_DATA: Record<GlossaryLocale, GlossaryTerm[]> = {
  'fr-BE': frBE,
  'nl-BE': nlBE,
  en,
};

export function isGlossaryLocale(locale: string): locale is GlossaryLocale {
  return GLOSSARY_LOCALES.includes(locale as GlossaryLocale);
}

export function getGlossaryTerms(locale: GlossaryLocale): GlossaryTerm[] {
  return GLOSSARY_DATA[locale];
}

export function getGlossaryTerm(locale: GlossaryLocale, slug: string): GlossaryTerm | undefined {
  return GLOSSARY_DATA[locale].find((term) => term.slug === slug);
}

export function getAllGlossarySlugs(): string[] {
  return getGlossaryTerms('fr-BE').map((term) => term.slug);
}

export function getLocalePrefix(locale: string): string {
  if (isGlossaryLocale(locale)) {
    return GLOSSARY_LOCALE_PREFIXES[locale];
  }
  return `/${locale}`;
}

export function buildCanonicalUrl(path: string, locale: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ankora-chi.vercel.app';
  const prefix = getLocalePrefix(locale);
  return `${baseUrl}${prefix}${path}`;
}
