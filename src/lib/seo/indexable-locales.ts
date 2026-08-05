import { LOCALES_VISIBLE, routing, type Locale } from '@/i18n/routing';

/**
 * Quelles locales le site accepte de faire indexer — et c'est la MÊME réponse
 * pour le sitemap et pour la balise `robots` de chaque page.
 *
 * Elles étaient deux à répondre, et elles se contredisaient. `sitemap.ts` ne
 * soumettait déjà que FR + EN, avec une raison écrite : `nl-BE`, `de-DE` et
 * `es-ES` résolvent (les liens profonds et les marque-pages de QA continuent de
 * fonctionner) mais leur contenu landing est encore du français mot pour mot.
 * Pendant ce temps `[locale]/layout.tsx` déclarait `index: true` pour les cinq,
 * et annonçait les cinq en `hreflang`.
 *
 * **Ne pas soumettre une URL n'empêche pas de l'indexer.** Il suffit qu'un lien
 * la fasse découvrir. Le site demandait donc bel et bien à Google d'indexer des
 * pages néerlandaises, allemandes et espagnoles écrites en français — et lui
 * donnait en prime les `hreflang` pour les trouver.
 *
 * Une seule liste, deux consommateurs. Ajouter une locale ici après validation
 * de sa traduction la rend indexable et l'annonce en `hreflang` du même geste ;
 * il n'y a plus de second endroit à ne pas oublier.
 */
export const INDEXABLE_LOCALES = LOCALES_VISIBLE;

/** `true` si cette locale a une traduction validée, donc si on l'indexe. */
export function isIndexableLocale(locale: string): boolean {
  return (INDEXABLE_LOCALES as readonly string[]).includes(locale);
}

/** Chemin public d'une locale — la locale par défaut vit à la racine. */
export function localePath(locale: Locale | string): string {
  return locale === routing.defaultLocale ? '/' : `/${locale}`;
}

/**
 * Les alternates `hreflang`, restreints aux locales indexables.
 *
 * Pointer un `hreflang` vers une page `noindex` est une contradiction que
 * Search Console signale — et c'était l'état du site avant ce correctif.
 */
export function indexableLanguageAlternates(): Record<string, string> {
  return Object.fromEntries(INDEXABLE_LOCALES.map((l) => [l, localePath(l)]));
}
