import { describe, it, expect } from 'vitest';
import {
  GLOSSARY_LOCALES,
  getGlossaryTerms,
  getGlossaryTerm,
  isGlossaryLocale,
  getAllGlossarySlugs,
} from '@/lib/glossary';

describe('Glossary Data Layer', () => {
  describe('isGlossaryLocale', () => {
    it('should return true for valid glossary locales', () => {
      expect(isGlossaryLocale('fr-BE')).toBe(true);
      expect(isGlossaryLocale('nl-BE')).toBe(true);
      expect(isGlossaryLocale('en')).toBe(true);
    });

    it('should return false for non-glossary locales', () => {
      expect(isGlossaryLocale('es-ES')).toBe(false);
      expect(isGlossaryLocale('de-DE')).toBe(false);
      expect(isGlossaryLocale('unknown')).toBe(false);
    });
  });

  describe('getGlossaryTerms', () => {
    it('should return 15 terms for each locale', () => {
      for (const locale of GLOSSARY_LOCALES) {
        const terms = getGlossaryTerms(locale);
        expect(terms).toHaveLength(15);
      }
    });

    it('should have all required fields in each term', () => {
      for (const locale of GLOSSARY_LOCALES) {
        const terms = getGlossaryTerms(locale);
        terms.forEach((term) => {
          expect(term).toHaveProperty('slug');
          expect(term).toHaveProperty('term');
          expect(term).toHaveProperty('shortDefinition');
          expect(term).toHaveProperty('whyItMatters');
          expect(term).toHaveProperty('example');
          expect(term).toHaveProperty('relatedTerms');
        });
      }
    });

    it('should have non-empty values for all fields', () => {
      for (const locale of GLOSSARY_LOCALES) {
        const terms = getGlossaryTerms(locale);
        terms.forEach((term) => {
          expect(term.slug.length).toBeGreaterThan(0);
          expect(term.term.length).toBeGreaterThan(0);
          expect(term.shortDefinition.length).toBeGreaterThan(0);
          expect(term.whyItMatters.length).toBeGreaterThan(0);
          expect(term.example.length).toBeGreaterThan(0);
        });
      }
    });

    it('should have valid slugs with no uppercase or spaces', () => {
      for (const locale of GLOSSARY_LOCALES) {
        const terms = getGlossaryTerms(locale);
        terms.forEach((term) => {
          expect(term.slug).toMatch(/^[a-z0-9-]+$/);
        });
      }
    });

    it('should have arrays of relatedTerms', () => {
      for (const locale of GLOSSARY_LOCALES) {
        const terms = getGlossaryTerms(locale);
        terms.forEach((term) => {
          expect(Array.isArray(term.relatedTerms)).toBe(true);
          expect(term.relatedTerms.length).toBeGreaterThanOrEqual(0);
          expect(term.relatedTerms.length).toBeLessThanOrEqual(5);
        });
      }
    });
  });

  describe('getGlossaryTerm', () => {
    it('should return a specific term by slug', () => {
      const term = getGlossaryTerm('fr-BE', 'budget-de-lissage');
      expect(term).toBeDefined();
      expect(term?.slug).toBe('budget-de-lissage');
      expect(term?.term).toBe('Budget de lissage');
    });

    it('should return undefined for non-existent slugs', () => {
      const term = getGlossaryTerm('fr-BE', 'non-existent-slug');
      expect(term).toBeUndefined();
    });

    it('should return localized terms', () => {
      const frTerm = getGlossaryTerm('fr-BE', 'compte-bucket');
      const nlTerm = getGlossaryTerm('nl-BE', 'compte-bucket');
      const enTerm = getGlossaryTerm('en', 'compte-bucket');

      expect(frTerm?.term).toBe('Compte bucket (compte thématique)');
      expect(nlTerm?.term).toBe('Bucket-rekening (thematische rekening)');
      expect(enTerm?.term).toBe('Bucket account (themed account)');
    });
  });

  describe('getAllGlossarySlugs', () => {
    it('should return all 15 slugs', () => {
      const slugs = getAllGlossarySlugs();
      expect(slugs).toHaveLength(15);
    });

    it('should return unique slugs', () => {
      const slugs = getAllGlossarySlugs();
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(slugs.length);
    });
  });

  describe('relatedTerms validation', () => {
    it('should not contain dangling references', () => {
      for (const locale of GLOSSARY_LOCALES) {
        const terms = getGlossaryTerms(locale);
        const validSlugs = new Set(terms.map((t) => t.slug));

        terms.forEach((term) => {
          term.relatedTerms.forEach((relatedSlug) => {
            expect(
              validSlugs.has(relatedSlug),
              `Term "${term.slug}" references non-existent slug "${relatedSlug}"`,
            ).toBe(true);
          });
        });
      }
    });

    it('should use French slugs in all locales', () => {
      for (const locale of GLOSSARY_LOCALES) {
        const terms = getGlossaryTerms(locale);
        const frTermSlugs = new Set(getGlossaryTerms('fr-BE').map((t) => t.slug));

        terms.forEach((term) => {
          term.relatedTerms.forEach((relatedSlug) => {
            expect(
              frTermSlugs.has(relatedSlug),
              `Locale "${locale}" uses non-French slug "${relatedSlug}"`,
            ).toBe(true);
          });
        });
      }
    });
  });
});
