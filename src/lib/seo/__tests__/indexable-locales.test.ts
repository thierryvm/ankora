import { describe, it, expect } from 'vitest';

import { LOCALES, LOCALES_VISIBLE, routing } from '@/i18n/routing';
import {
  INDEXABLE_LOCALES,
  isIndexableLocale,
  localePath,
  indexableLanguageAlternates,
} from '@/lib/seo/indexable-locales';

const untranslated = LOCALES.filter((l) => !(LOCALES_VISIBLE as readonly string[]).includes(l));

/**
 * Deux endroits répondaient à « quelles locales indexe-t-on ? », et ils se
 * contredisaient : `sitemap.ts` ne soumettait que FR + EN, tandis que
 * `[locale]/layout.tsx` déclarait `index: true` pour les cinq et annonçait les
 * cinq en `hreflang`.
 *
 * Ne pas soumettre une URL n'empêche pas de l'indexer — il suffit qu'un lien la
 * fasse découvrir. Le site demandait donc à Google d'indexer des pages
 * néerlandaises, allemandes et espagnoles écrites en français, et lui donnait
 * les `hreflang` pour les trouver.
 *
 * Les assertions dérivent de `LOCALES_VISIBLE` plutôt que d'une liste écrite en
 * dur : le jour où une traduction est validée, le test suit tout seul. Une
 * liste codée ici serait un troisième endroit à maintenir — donc à oublier.
 */
describe('indexable-locales', () => {
  it('couvre bien des locales non traduites, sinon la moitié des cas serait vide', () => {
    expect(untranslated.length).toBeGreaterThan(0);
    expect(LOCALES_VISIBLE.length).toBeGreaterThan(0);
  });

  it.each(LOCALES_VISIBLE)('indexe %s, dont la traduction est validée', (locale) => {
    expect(isIndexableLocale(locale)).toBe(true);
  });

  it.each(untranslated)('n’indexe pas %s, dont le contenu est encore français', (locale) => {
    expect(isIndexableLocale(locale)).toBe(false);
  });

  it('refuse une locale inconnue plutôt que de l’indexer par défaut', () => {
    expect(isIndexableLocale('pt-BR')).toBe(false);
    expect(isIndexableLocale('')).toBe(false);
  });

  it('sert la locale par défaut à la racine et les autres sous leur préfixe', () => {
    expect(localePath(routing.defaultLocale)).toBe('/');
    expect(localePath('nl-BE')).toBe('/nl-BE');
  });

  it('n’annonce en hreflang que ce qu’il accepte d’indexer', () => {
    const alternates = indexableLanguageAlternates();
    expect(Object.keys(alternates).sort()).toEqual([...INDEXABLE_LOCALES].sort());
    // C'est l'assertion qui compte : un `hreflang` vers une page `noindex` est
    // la contradiction que Search Console signale, et c'était l'état du site.
    for (const locale of untranslated) {
      expect(alternates).not.toHaveProperty(locale);
    }
  });

  it('n’annonce jamais une locale absente du routage', () => {
    for (const locale of Object.keys(indexableLanguageAlternates())) {
      expect(LOCALES).toContain(locale);
    }
  });
});
