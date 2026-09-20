import type { Locale } from '@/i18n/routing';
import { formatCurrency } from '@/lib/i18n/formatters';

/**
 * La part mensuelle d'une facture — jamais sans la facture dont elle vient.
 *
 * ## Pourquoi ce composant existe plutôt qu'une chaîne recopiée
 *
 * « 15 € par mois » ne se vérifie pas. « 45 € tous les 3 mois → 15,00 € par
 * mois » se vérifie de tête, et dit du même coup POURQUOI le budget du mois a
 * retenu 15 € alors que rien ne sort ce mois-ci. C'est la règle 10 du
 * CLAUDE.md appliquée au cas le plus fréquent du produit : un quotient affiché
 * seul est une injonction.
 *
 * Une seule implémentation, pour que les deux moitiés ne puissent pas se
 * séparer à l'usage. Le jour où quelqu'un voudra n'afficher que la part, il
 * devra le faire exprès, ailleurs — pas par omission ici.
 *
 * ## Les formats
 *
 * Les deux montants passent par `formatCurrency`, le formateur du projet. La
 * maquette v3 distingue l'euro entier (dans une phrase) du centime (dans une
 * liste) ; ce formateur-ci n'expose pas ce réglage, et l'ajouter toucherait
 * toutes les pages. Cette distinction est donc laissée à la PR qui reprendra
 * les formats — elle n'est pas oubliée, elle est hors de ce lot.
 */
export type PartMensuelleProps = Readonly<{
  montantFacture: number;
  /** 3, 6 ou 12 — jamais 1 : une mensuelle ne subit aucune division. */
  cycleMois: number;
  montantMensuel: number;
  locale: Locale;
  /**
   * Le traducteur du namespace `cockpit.partMensuelle`, obtenu par le parent.
   *
   * Pourquoi en prop plutôt qu'un `await getTranslations()` ici : ce composant
   * se rend DANS une liste, et un Server Component `async` imbriqué ne se
   * résout pas dans un rendu de test — le bloc entier disparaissait en silence,
   * et seul un test l'a montré. Synchrone, il se teste au DOM comme il rend en
   * production.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: 'phrase', values: Record<string, any>) => string;
}>;

export function PartMensuelle({
  montantFacture,
  cycleMois,
  montantMensuel,
  locale,
  t,
}: PartMensuelleProps) {
  return (
    <p className="text-muted-foreground mt-0.5 text-xs" data-part-mensuelle>
      {t('phrase', {
        facture: formatCurrency(montantFacture, locale),
        cycle: cycleMois,
        part: formatCurrency(montantMensuel, locale),
      })}
    </p>
  );
}
