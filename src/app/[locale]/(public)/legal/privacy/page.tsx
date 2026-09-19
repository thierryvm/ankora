import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { brand } from '@/lib/brand';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Prose, ProseMeta } from '@/components/layout/Prose';
import { buildCanonicalUrl } from '@/lib/glossary';

const LAST_UPDATED = '19 septembre 2026';
const VERSION = '2.0.0';

/**
 * The policy is composed on publiable.dev: sourced, dated legal sentences,
 * carried word for word into `legal.privacy.*`. Rewording one would detach it
 * from its source, so the page renders whatever the messages hold, in their
 * order, instead of naming each sentence here.
 *
 * Shape of a section: `heading`, then `p1…pN` (paragraphs), then nested
 * objects (sub-sections, rendered as h3 with the same shape).
 */
const SECTIONS = ['controller', 'data', 'rights', 'objection', 'complaint', 'extras'] as const;

type Node = { [key: string]: string | Node };

/**
 * The keys are walked from the messages themselves, so they are plain strings
 * rather than the literal union next-intl infers. Every key rendered here was
 * read from `t.raw()` one line earlier: it exists by construction.
 */
type WalkingTranslator = {
  (key: string): string;
  rich: (key: string, values: Record<string, unknown>) => ReactNode;
  raw: (key: string) => unknown;
};

function textOf(chunks: ReactNode): string {
  return Array.isArray(chunks) ? chunks.join('') : String(chunks);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // `params`, not `getLocale()`: the latter works only because the locale
  // layout happens to call `cookies()` for the theme, which forces dynamic
  // rendering. Reading the segment directly removes that hidden coupling and
  // matches how the glossary pages already do it.
  const { locale } = await params;
  const t = await getTranslations('legal.privacy');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: true },
    alternates: { canonical: buildCanonicalUrl('/legal/privacy', locale) },
  };
}

export default async function PrivacyPage() {
  const t = (await getTranslations('legal.privacy')) as unknown as WalkingTranslator;
  const tLegal = await getTranslations('legal');

  const tags = {
    email: brand.privacyEmail,
    mail: (c: ReactNode) => <a href={`mailto:${brand.privacyEmail}`}>{c}</a>,
    // The sources Publiable cites (DPA, published lists, the APD) are real
    // links: a date of verification is only useful if the page can be opened.
    url: (c: ReactNode) => (
      <a href={textOf(c)} rel="noopener noreferrer" className="break-all">
        {c}
      </a>
    ),
    link: (c: ReactNode) => <Link href="/legal/cookies">{c}</Link>,
  };

  const renderSection = (path: string, depth: 2 | 3): ReactNode => {
    const node = t.raw(path) as Node;
    const Heading = depth === 2 ? 'h2' : 'h3';
    return (
      <section key={path} aria-labelledby={`privacy-${path.replace(/\./g, '-')}`}>
        <Heading id={`privacy-${path.replace(/\./g, '-')}`}>{t(`${path}.heading`)}</Heading>
        {Object.entries(node).map(([key, value]) => {
          if (key === 'heading') return null;
          if (typeof value === 'string') {
            return <p key={key}>{t.rich(`${path}.${key}`, tags)}</p>;
          }
          return renderSection(`${path}.${key}`, 3);
        })}
      </section>
    );
  };

  const languageNotice = t('languageNotice');

  return (
    <>
      <Header variant="marketing" />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Prose>
          <h1>{t('title')}</h1>
          <ProseMeta>{tLegal('versionLine', { version: VERSION, date: LAST_UPDATED })}</ProseMeta>
          {/* Empty in fr-BE and en; nl-BE, de-DE and es-ES carry a copy of the
              policy in another language and say so in their own. */}
          {languageNotice ? <p>{languageNotice}</p> : null}
          <p>{t('intro')}</p>
          {SECTIONS.map((section) => renderSection(section, 2))}
        </Prose>
      </main>
      <Footer />
    </>
  );
}
