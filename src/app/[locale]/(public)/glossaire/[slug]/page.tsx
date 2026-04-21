import { getTranslations } from 'next-intl/server';
import {
  GLOSSARY_LOCALES,
  getGlossaryTerms,
  getGlossaryTerm,
  isGlossaryLocale,
  buildCanonicalUrl,
  getLocalePrefix,
} from '@/lib/glossary';
import { JsonLd } from '@/components/seo/JsonLd';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamicParams = false;

type LocaleSlugParams = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: LocaleSlugParams) {
  const { locale, slug } = await params;

  if (!isGlossaryLocale(locale)) {
    notFound();
  }

  const term = getGlossaryTerm(locale, slug);
  if (!term) {
    notFound();
  }

  const canonicalUrl = buildCanonicalUrl(`/glossaire/${slug}`, locale);

  return {
    title: term.term,
    description: term.shortDefinition,
    alternates: {
      canonical: canonicalUrl,
      languages: Object.fromEntries(
        GLOSSARY_LOCALES.map((l) => [l, buildCanonicalUrl(`/glossaire/${slug}`, l)]),
      ),
    },
  };
}

export async function generateStaticParams() {
  return GLOSSARY_LOCALES.flatMap((locale) =>
    getGlossaryTerms(locale).map((term) => ({
      locale,
      slug: term.slug,
    })),
  );
}

export default async function GlossaireTermPage({ params }: LocaleSlugParams) {
  const { locale, slug } = await params;

  if (!isGlossaryLocale(locale)) {
    notFound();
  }

  const term = getGlossaryTerm(locale, slug);
  if (!term) {
    notFound();
  }

  const t = await getTranslations('glossary');
  const localePrefix = getLocalePrefix(locale);
  const canonicalUrl = buildCanonicalUrl(`/glossaire/${slug}`, locale);

  const definedTermJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    '@id': canonicalUrl,
    name: term.term,
    description: term.shortDefinition,
    inDefinedTermSet: `${buildCanonicalUrl('/glossaire', locale)}#termset`,
  };

  const breadcrumbListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t('breadcrumb.home'),
        item: buildCanonicalUrl('', locale),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t('breadcrumb.glossary'),
        item: buildCanonicalUrl('/glossaire', locale),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: term.term,
        item: canonicalUrl,
      },
    ],
  };

  const relatedTermsMap = getGlossaryTerms(locale).reduce(
    (acc, t) => {
      acc[t.slug] = t.term;
      return acc;
    },
    {} as Record<string, string>,
  );

  return (
    <>
      <Header variant="marketing" />
      <main className="bg-background min-h-screen">
        <div className="container mx-auto px-4 py-12 sm:py-16">
          <Breadcrumb
            items={[
              { label: t('breadcrumb.home'), href: localePrefix || '/' },
              { label: t('breadcrumb.glossary'), href: `${localePrefix}/glossaire` },
              { label: term.term },
            ]}
            className="mb-8"
          />

          <header className="mb-12">
            <h1 className="text-foreground text-4xl font-bold tracking-tight sm:text-5xl">
              {term.term}
            </h1>
            <p className="text-muted-foreground mt-4 text-xl">{term.shortDefinition}</p>
          </header>

          <div className="max-w-3xl space-y-12">
            <section>
              <h2 className="text-foreground mb-4 text-2xl font-semibold">
                {t('section.whyItMatters')}
              </h2>
              <p className="text-foreground text-lg leading-relaxed">{term.whyItMatters}</p>
            </section>

            <section>
              <h2 className="text-foreground mb-4 text-2xl font-semibold">
                {t('section.example')}
              </h2>
              <blockquote className="border-brand-600 bg-card text-foreground rounded-r-lg border-l-4 py-4 pl-6 italic">
                {term.example}
              </blockquote>
            </section>

            {term.relatedTerms.length > 0 && (
              <section>
                <h2 className="text-foreground mb-4 text-2xl font-semibold">
                  {t('section.relatedTerms')}
                </h2>
                <ul className="flex flex-wrap gap-3">
                  {term.relatedTerms.map((relatedSlug) => (
                    <li key={relatedSlug}>
                      <Link
                        href={`${localePrefix}/glossaire/${relatedSlug}`}
                        className="bg-secondary text-secondary-foreground hover:bg-brand-600 inline-block rounded-full px-4 py-2 text-sm font-medium transition-colors hover:text-white"
                      >
                        {relatedTermsMap[relatedSlug] || relatedSlug}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </main>
      <JsonLd data={definedTermJsonLd} />
      <JsonLd data={breadcrumbListJsonLd} />
      <Footer />
    </>
  );
}
