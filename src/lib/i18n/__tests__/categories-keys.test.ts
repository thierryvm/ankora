import { describe, expect, it } from 'vitest';

/**
 * Les clés de la création de catégorie, présentes et non vides dans les 5 locales.
 *
 * ## Pourquoi ce fichier existe, et ce qu'il attrape que rien d'autre n'attrape
 *
 * **Il n'existe aucun test de parité de clés dans ce dépôt.** Une clé manquante
 * ne rougit donc nulle part : `next-intl` la rend telle quelle, et un écran
 * affiche « newCategoryCreate » à la place de « Créer » sans qu'aucune porte ne
 * bronche.
 *
 * Pire pour les deux codes d'erreur : `useActionErrorTranslator` **retombe
 * silencieusement** sur le message générique. « Tu as déjà une catégorie qui
 * porte ce nom » deviendrait « Une erreur est survenue » — le message précis,
 * seule chose que ce chantier apporte à ce moment-là, disparaîtrait sans laisser
 * de trace.
 *
 * Et le mock de `next-intl` du test de la feuille ne peut pas le voir : il
 * résout contre `fr-BE.json` **seul**, et rend la clé littérale quand elle
 * manque. Il serait donc vert avec quatre locales trouées.
 *
 * ## Ce que ce test ne fait PAS
 *
 * Il ne vérifie pas que la traduction est traduite. `nl-BE`, `de-DE` et `es-ES`
 * portent le texte français verbatim, comme le reste du namespace : ces trois
 * locales ne sont pas activées, et la dette de traduction est tracée ailleurs.
 * Écrire du faux néerlandais serait pire que du français assumé.
 */
const LOCALES = ['fr-BE', 'en', 'nl-BE', 'de-DE', 'es-ES'] as const;

const CLES_FEUILLE = [
  'newCategory',
  'newCategoryName',
  'newCategoryColor',
  'newCategoryCreate',
  'newCategoryCancel',
] as const;

/** Les 8 jetons de `CATEGORY_COLOR_TOKENS`, chacun nommé pour un lecteur d'écran. */
const CLES_COULEUR = [
  'blue',
  'cyan',
  'emerald',
  'amber',
  'rose',
  'pink',
  'purple',
  'zinc',
] as const;

const CLES_ERREUR = ['createFailed', 'duplicate', 'duplicateBill'] as const;

type Messages = {
  app: { expenses: { addSheet: Record<string, unknown> } };
  errors: Record<string, Record<string, unknown> | undefined>;
};

async function messages(locale: string): Promise<Messages> {
  return (await import(`../../../../messages/${locale}.json`)).default as Messages;
}

/**
 * Rend `undefined` plutôt que de rétrécir en `string`.
 *
 * Une valeur absente est précisément ce que ce fichier cherche : la narrower en
 * `as string` laisserait `tsc` vert et ferait porter l'assertion sur
 * `undefined`, ce qui se lit vert dans la moitié des matchers.
 */
function texte(valeur: unknown): string | undefined {
  return typeof valeur === 'string' ? valeur : undefined;
}

describe('création de catégorie — les clés existent dans les 5 locales', () => {
  it.each(LOCALES)('%s — la feuille de saisie', async (locale) => {
    const m = await messages(locale);
    for (const cle of CLES_FEUILLE) {
      const valeur = texte(m.app.expenses.addSheet[cle]);
      expect(valeur, `${locale} → app.expenses.addSheet.${cle} manquante`).toBeTypeOf('string');
      expect(valeur?.trim().length ?? 0, `${locale} → …${cle} vide`).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)('%s — les 8 noms de couleur', async (locale) => {
    const m = await messages(locale);
    const couleurs = m.app.expenses.addSheet.color as Record<string, unknown> | undefined;
    expect(couleurs, `${locale} → app.expenses.addSheet.color manquant`).toBeTypeOf('object');
    for (const jeton of CLES_COULEUR) {
      const valeur = texte(couleurs?.[jeton]);
      expect(valeur, `${locale} → …color.${jeton} manquante`).toBeTypeOf('string');
      expect(valeur?.trim().length ?? 0, `${locale} → …color.${jeton} vide`).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)('%s — les trois codes d’erreur, que le repli masquerait', async (locale) => {
    const m = await messages(locale);
    const erreurs = m.errors.categories;
    expect(erreurs, `${locale} → errors.categories manquant`).toBeTypeOf('object');
    for (const cle of CLES_ERREUR) {
      const valeur = texte(erreurs?.[cle]);
      expect(valeur, `${locale} → errors.categories.${cle} manquante`).toBeTypeOf('string');
      expect(valeur?.trim().length ?? 0, `${locale} → …${cle} vide`).toBeGreaterThan(0);
    }
  });

  it('aucune de ces clés n’utilise le pluriel ICU', async () => {
    // Le mock `next-intl` du test de la feuille ne fait qu'un
    // `replace(/\{(\w+)\}/g, …)` : une clé en `{count, plural, …}` ne rendrait
    // pas en test, et le cas passerait vert sur une chaîne cassée. Contrainte
    // sur ce que ces clés ont le droit d'être, tant que ce mock est en place.
    const m = await messages('fr-BE');
    const sheet = m.app.expenses.addSheet;
    for (const cle of CLES_FEUILLE) {
      expect(texte(sheet[cle]), `${cle} contient un pluriel ICU`).not.toMatch(/\{\s*\w+\s*,/);
    }
  });
});
