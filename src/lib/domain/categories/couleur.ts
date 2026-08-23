import { CATEGORY_COLOR_TOKENS, type Category, type CategoryColorToken } from './types';

/**
 * La pastille pré-sélectionnée quand on crée une catégorie.
 *
 * ## Pourquoi pas « la première couleur libre »
 *
 * Parce qu'il n'y en a jamais. Les 8 jetons sont **tous** consommés dès
 * l'inscription : le semis du 3 mai en pose 8 pour 8 catégories, un chacun, et
 * celui du 29 juillet en réutilise 10 sans en introduire un seul. Une règle
 * « première non utilisée » ne se déclencherait donc jamais et retomberait
 * toujours sur le même repli — une règle morte qui a l'air vivante.
 *
 * ## Ce que « la moins utilisée » donne réellement
 *
 * Après les 18 catégories semées : `pink` et `amber` à 3, les six autres à 2.
 * L'égalité à six est départagée par l'ordre de {@link CATEGORY_COLOR_TOKENS},
 * donc **la première catégorie créée sera bleue, pour tout le monde**. La
 * variété n'apparaît qu'à partir de la deuxième.
 *
 * Ce n'est pas un défaut, c'est ce que la règle promet : un défaut *déterministe*
 * qui s'écarte du plus chargé. Écrit ici pour qu'un test ne soit pas rédigé
 * contre la promesse imaginaire « ça donne une couleur différente à chaque
 * fois ».
 *
 * Le départage par l'ordre de déclaration, et non par un hasard, tient la même
 * promesse que le classement des puces : deux ouvertures identiques du même
 * écran montrent la même chose.
 */
export function couleurLaMoinsUtilisee(categories: readonly Category[]): CategoryColorToken {
  const usages = new Map<CategoryColorToken, number>(
    CATEGORY_COLOR_TOKENS.map((jeton) => [jeton, 0]),
  );
  for (const categorie of categories) {
    const compte = usages.get(categorie.colorToken);
    // `colorToken` est validé à la lecture (`data/categories.ts`), donc une
    // valeur hors liste ne devrait pas exister. On l'ignore plutôt que de
    // l'ajouter à la carte : elle fausserait un décompte sans jamais pouvoir
    // être proposée.
    if (compte !== undefined) usages.set(categorie.colorToken, compte + 1);
  }

  let choisi: CategoryColorToken = CATEGORY_COLOR_TOKENS[0];
  let minimum = Number.POSITIVE_INFINITY;
  for (const jeton of CATEGORY_COLOR_TOKENS) {
    const compte = usages.get(jeton) ?? 0;
    // Strictement inférieur : à égalité, le premier déclaré gagne.
    if (compte < minimum) {
      minimum = compte;
      choisi = jeton;
    }
  }
  return choisi;
}
