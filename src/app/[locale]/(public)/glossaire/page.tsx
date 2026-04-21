import { getTranslations } from 'next-intl/server';
import {
  GLOSSARY_LOCALES,
  getGlossaryTerms,
  isGlossaryLocale,
  buildCanonicalUrl,
} from '@/lib/glossary';
import { JsonLd } from '@/components/seo/JsonLd';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamicParams = false;

type Params = { locale: string };
type LocaleParams = { params: Promise<Params> };

export async function generateMetadata({ params }: LocaleParams) {
  const { locale } = await params;
  const t = await getTranslations('glossary');

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export async function generateStaticParams() {
  return GLOSSARY_LOCALES.map((locale) => ({ locale }));
}

export default async function GlossairePage({ params }: LocaleParams) {
  const { locale } = await params;

  if (!isGlossaryLocale(locale)) {
    notFound();
  }

  const t = await getTranslations('glossary');
  const terms = getGlossaryTerms(locale);

  const canonicalUrl = buildCanonicalUrl('/glossaire', locale);

  const definedTermSetJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': `${canonicalUrl}#termset`,
    name: t('title'),
    inLanguage: locale,
    hasDefinedTerm: terms.map((term) => ({
      '@type': 'DefinedTerm',
      name: term.term,
      description: term.shortDefinition,
    })),
  };

  return (
    <>
      <Header variant="marketing" />
      <main className="bg-background min-h-screen">
        <div className="container mx-auto px-4 py-16 sm:py-24">
          <h1 className="text-foreground text-4xl font-bold tracking-tight sm:text-5xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-4 text-xl">{t('subtitle')}</p>

          <ul role="list" className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {terms.map((term) => (
              <li key={term.slug}>
                <Link href={`/glossaire/${term.slug}`}>
                  <div className="border-border bg-card hover:border-brand-600 block h-full rounded-lg border p-6 transition-all hover:shadow-lg">
                    <h2 className="text-foreground text-lg font-semibold">{term.term}</h2>
                    <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
                      {term.shortDefinition}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <JsonLd data={definedTermSetJsonLd} />
      <Footer />
    </>
  );
}
