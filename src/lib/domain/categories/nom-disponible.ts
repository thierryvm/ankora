import type { CategoryKind } from './types';

/**
 * Deux catégories portent-elles « le même nom » aux yeux d'un humain ?
 *
 * ## Pourquoi ceci vit dans le domaine et pas dans une requête SQL
 *
 * Le premier réflexe était `.ilike('name', nom)`. Il est faux, et pas
 * subtilement : `ilike` prend un **motif**, pas une valeur. `%` et `_` saisis
 * par l'utilisateur y sont des jokers. Une catégorie nommée « Réduction 50% »
 * matcherait des lignes sans rapport ; une catégorie nommée `%` matcherait
 * TOUT, serait donc déclarée doublon pour toujours, et deviendrait impossible à
 * créer. Ce n'est pas une faille — le client Supabase paramètre — c'est un bug
 * atteignable en tapant un caractère.
 *
 * En TS pur, il n'y a pas de sémantique de motif à contourner, et la règle se
 * teste sans base de données.
 *
 * ## Ce que la clé normalise, et ce qu'elle refuse de normaliser
 *
 * ADR-043 D2 demande un contrôle « insensible à la casse et aux espaces de
 * bordure ». Trois choses s'y ajoutent parce que sans elles la règle se
 * contourne sans le vouloir :
 *
 * - **NFC.** « Santé » peut arriver décomposé (`e` + U+0301) ou composé
 *   (U+00E9) selon le clavier. Canoniquement équivalents, rendus à l'identique,
 *   `===` faux. Une normalisation, et **aucun accent n'est retiré** — c'est une
 *   opération orthogonale au point suivant.
 * - **Les espaces intérieurs.** « Restaurant  café » avec deux espaces est le
 *   même nom que « Restaurant café ». `trim()` seul ne les voit pas.
 * - **Les invisibles.** U+200B (espace de largeur nulle) et ses voisins ne sont
 *   ni retirés par `trim()` ni visibles à l'écran : « Courses » et
 *   « Courses​ » seraient deux catégories distinctes et indistinguables.
 *
 * **Les accents, eux, ne sont PAS dépouillés.** « Santé » et « Sante » restent
 * deux noms différents. Les confondre demanderait de deviner l'intention, et
 * refuser « Sante » à quelqu'un qui possède déjà « Santé » serait plus
 * déroutant que le doublon lui-même.
 *
 * `toLocaleLowerCase('fr-BE')` plutôt que `toLowerCase()` : l'étiquette est
 * épinglée pour que la règle ne dépende jamais de la locale de la machine — le
 * `İ` turc est le contre-exemple classique. Le français n'a pas de casse
 * spéciale CLDR, donc le résultat est identique ; la précaution est gratuite.
 */
export function cleNomCategorie(nom: string): string {
  return nom
    .normalize('NFC')
    .replace(/[​-‍­﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fr-BE');
}

/**
 * La catégorie qui porte déjà ce nom, ou `null`.
 *
 * **Rend la catégorie, pas un booléen**, et c'est le point : le message à
 * afficher dépend de son `kind`. Un homonyme `fixed` (Taxes, Abonnements,
 * Assurances, Crédits) n'apparaît jamais dans le sélecteur de dépense — ADR-035
 * §5 l'en exclut pour ne pas déduire deux fois la même facture. Dire seulement
 * « cette catégorie existe déjà » à propos d'une ligne que l'écran ne montre
 * pas fait passer l'application pour cassée.
 *
 * Le contrôle porte donc sur **toutes** les catégories, `fixed` comprises : la
 * base n'a aucune contrainte d'unicité, et deux lignes homonymes de types
 * différents sont indistinguables partout où on les liste.
 *
 * Générique sur `{ name, kind }` plutôt que sur `Category` : l'appelant doit
 * pouvoir passer des lignes brutes issues d'une requête qui remonte son erreur,
 * sans passer par un lecteur qui replie sur `[]` — un tableau vide silencieux
 * transformerait ce contrôle en no-op.
 */
export function categorieHomonyme<T extends { name: string; kind: CategoryKind }>(
  nom: string,
  categories: readonly T[],
): T | null {
  const cle = cleNomCategorie(nom);
  // Un nom vide n'a pas d'homonyme : c'est un défaut de saisie, que le schéma
  // Zod refuse avant d'arriver ici. Rendre `null` évite qu'il matche une
  // hypothétique ligne vide en base.
  if (cle === '') return null;
  return categories.find((categorie) => cleNomCategorie(categorie.name) === cle) ?? null;
}
