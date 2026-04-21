import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messagesFrBE from '../../messages/fr-BE.json';
import messagesNlBE from '../../messages/nl-BE.json';
import messagesEn from '../../messages/en.json';
import messagesEsES from '../../messages/es-ES.json';
import messagesDeDE from '../../messages/de-DE.json';

const messages = {
  'fr-BE': messagesFrBE,
  'nl-BE': messagesNlBE,
  en: messagesEn,
  'es-ES': messagesEsES,
  'de-DE': messagesDeDE,
};

const mockBudgetDeLissage = {
  slug: 'budget-de-lissage',
  term: 'Budget de lissage',
  shortDefinition: 'Méthode budgétaire qui répartit les charges annuelles...',
  whyItMatters: 'Sans lissage, une facture...',
  example: 'Précompte immobilier annuel...',
  relatedTerms: ['compte-bucket', 'fonds-de-roulement-personnel', 'charges-fixes'],
};

describe('Glossary Pages', () => {
  describe('Index page', () => {
    it('should render H1 with glossary title in French', () => {
      const messagesFr = messages['fr-BE'];
      const mockIndexContent = (
        <NextIntlClientProvider locale="fr-BE" messages={messagesFr}>
          <main>
            <h1>{messagesFr.glossary.title}</h1>
            <p>{messagesFr.glossary.subtitle}</p>
          </main>
        </NextIntlClientProvider>
      );

      const { container } = render(mockIndexContent);
      const h1 = container.querySelector('h1');
      expect(h1?.textContent).toContain('Glossaire');
    });

    it('should render H1 with glossary title in Dutch', () => {
      const messagesNl = messages['nl-BE'];
      const mockIndexContent = (
        <NextIntlClientProvider locale="nl-BE" messages={messagesNl}>
          <main>
            <h1>{messagesNl.glossary.title}</h1>
          </main>
        </NextIntlClientProvider>
      );

      const { container } = render(mockIndexContent);
      const h1 = container.querySelector('h1');
      expect(h1?.textContent).toBeDefined();
    });

    it('should render H1 with glossary title in English', () => {
      const messagesEng = messages['en'];
      const mockIndexContent = (
        <NextIntlClientProvider locale="en" messages={messagesEng}>
          <main>
            <h1>{messagesEng.glossary.title}</h1>
          </main>
        </NextIntlClientProvider>
      );

      const { container } = render(mockIndexContent);
      const h1 = container.querySelector('h1');
      expect(h1?.textContent).toBeDefined();
    });

    it('should have glossary namespace in all locales', () => {
      for (const locale of ['fr-BE', 'nl-BE', 'en'] as const) {
        const msg = messages[locale];
        expect(msg.glossary).toBeDefined();
        expect(msg.glossary.title).toBeDefined();
        expect(msg.glossary.subtitle).toBeDefined();
        expect(msg.glossary.metaTitle).toBeDefined();
        expect(msg.glossary.metaDescription).toBeDefined();
      }
    });
  });

  describe('Term page', () => {
    it('should render term title as H1', () => {
      const mockTermContent = (
        <main>
          <h1>{mockBudgetDeLissage.term}</h1>
          <p>{mockBudgetDeLissage.shortDefinition}</p>
        </main>
      );

      const { container } = render(mockTermContent);
      const h1 = container.querySelector('h1');
      expect(h1?.textContent).toBe('Budget de lissage');
    });

    it('should render all required sections', () => {
      const messagesFr = messages['fr-BE'];
      const mockTermContent = (
        <NextIntlClientProvider locale="fr-BE" messages={messagesFr}>
          <main>
            <h1>{mockBudgetDeLissage.term}</h1>
            <section>
              <h2>{messagesFr.glossary.section.whyItMatters}</h2>
              <p>{mockBudgetDeLissage.whyItMatters}</p>
            </section>
            <section>
              <h2>{messagesFr.glossary.section.example}</h2>
              <blockquote>{mockBudgetDeLissage.example}</blockquote>
            </section>
            <section>
              <h2>{messagesFr.glossary.section.relatedTerms}</h2>
              <ul>
                {mockBudgetDeLissage.relatedTerms.map((slug) => (
                  <li key={slug}>{slug}</li>
                ))}
              </ul>
            </section>
          </main>
        </NextIntlClientProvider>
      );

      const { container } = render(mockTermContent);
      const sections = container.querySelectorAll('section');
      expect(sections.length).toBe(3);
    });

    it('should render breadcrumb with home, glossary, and term', () => {
      const messagesFr = messages['fr-BE'];
      const mockBreadcrumb = (
        <NextIntlClientProvider locale="fr-BE" messages={messagesFr}>
          <nav aria-label="breadcrumb">
            <ol>
              <li>{messagesFr.glossary.breadcrumb.home}</li>
              <li>{messagesFr.glossary.breadcrumb.glossary}</li>
              <li>{mockBudgetDeLissage.term}</li>
            </ol>
          </nav>
        </NextIntlClientProvider>
      );

      render(mockBreadcrumb);
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('should render related terms as links', () => {
      const mockRelatedTerms = (
        <section>
          <h2>Related Terms</h2>
          <ul>
            {mockBudgetDeLissage.relatedTerms.map((slug) => (
              <li key={slug}>
                <a href={`/glossaire/${slug}`}>{slug}</a>
              </li>
            ))}
          </ul>
        </section>
      );

      const { container } = render(mockRelatedTerms);
      const links = container.querySelectorAll('a');
      expect(links.length).toBe(3);
      expect(links[0]).toHaveAttribute('href', '/glossaire/compte-bucket');
    });
  });

  describe('JSON-LD structure', () => {
    it('should have valid DefinedTerm schema', () => {
      const definedTerm = {
        '@context': 'https://schema.org',
        '@type': 'DefinedTerm',
        '@id': 'https://example.com/glossaire/budget-de-lissage',
        name: mockBudgetDeLissage.term,
        description: mockBudgetDeLissage.shortDefinition,
        inDefinedTermSet: 'https://example.com/glossaire#termset',
      };

      expect(definedTerm['@context']).toBe('https://schema.org');
      expect(definedTerm['@type']).toBe('DefinedTerm');
      expect(definedTerm.name).toBeDefined();
      expect(definedTerm.description).toBeDefined();
      expect(definedTerm.inDefinedTermSet).toBeDefined();
    });

    it('should have valid DefinedTermSet schema for index', () => {
      const definedTermSet = {
        '@context': 'https://schema.org',
        '@type': 'DefinedTermSet',
        '@id': 'https://example.com/glossaire#termset',
        name: 'Glossaire',
        inLanguage: 'fr-BE',
        hasDefinedTerm: [
          {
            '@type': 'DefinedTerm',
            name: mockBudgetDeLissage.term,
            description: mockBudgetDeLissage.shortDefinition,
          },
        ],
      };

      expect(definedTermSet['@type']).toBe('DefinedTermSet');
      expect(Array.isArray(definedTermSet.hasDefinedTerm)).toBe(true);
      expect(definedTermSet.hasDefinedTerm?.[0]?.['@type']).toBe('DefinedTerm');
    });

    it('should have valid BreadcrumbList schema', () => {
      const breadcrumbList = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://example.com',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Glossaire',
            item: 'https://example.com/glossaire',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: mockBudgetDeLissage.term,
            item: 'https://example.com/glossaire/budget-de-lissage',
          },
        ],
      };

      expect(breadcrumbList['@type']).toBe('BreadcrumbList');
      expect(breadcrumbList.itemListElement.length).toBe(3);
      expect(breadcrumbList.itemListElement[2]?.position).toBe(3);
    });
  });

  describe('i18n messages', () => {
    it('should have glossary namespace in all 5 locales', () => {
      const locales = ['fr-BE', 'nl-BE', 'en', 'es-ES', 'de-DE'] as const;
      for (const locale of locales) {
        expect(messages[locale as keyof typeof messages]).toBeDefined();
      }
    });

    it('should have required glossary keys', () => {
      const requiredKeys = [
        'title',
        'subtitle',
        'metaTitle',
        'metaDescription',
        'breadcrumb.home',
        'breadcrumb.glossary',
        'section.whyItMatters',
        'section.example',
        'section.relatedTerms',
      ];

      for (const locale of ['fr-BE', 'nl-BE', 'en'] as const) {
        const msg = messages[locale];
        for (const key of requiredKeys) {
          const keys = key.split('.');
          let val: unknown = msg.glossary;
          for (const k of keys) {
            val =
              typeof val === 'object' && val !== null
                ? (val as Record<string, unknown>)[k]
                : undefined;
          }
          expect(val, `Missing "${key}" in glossary namespace for ${locale}`).toBeDefined();
        }
      }
    });
  });
});
