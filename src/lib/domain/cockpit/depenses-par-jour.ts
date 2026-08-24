import Decimal from 'decimal.js';

/**
 * La série que la courbe du mois trace : dépensé par jour, et cumulé.
 *
 * ## L'invariant, et pourquoi il est la raison d'être de ce fichier
 *
 * **Le cumulé au dernier jour DU MOIS vaut « Dépensé ce mois » au centime.**
 * Cette fonction ne recalcule pas un total qui existe ailleurs pour l'afficher
 * autrement — elle le décompose. Si les deux divergent, l'écran affiche un
 * chiffre et une courbe qui se contredisent, sur la seule question que la page
 * pose.
 *
 * **Le mot « du mois » n'est pas un détail, et il a été écrit faux d'abord.**
 * L'énoncé initial disait « au dernier jour ÉCOULÉ », ce qui est plus fort et
 * **faux** : rien n'empêche aujourd'hui d'enregistrer une dépense datée plus
 * tard dans le mois courant — ni le champ date, ni le schéma Zod, ni une
 * contrainte en base. `depensesDuMois()` la compte ; la portion écoulée de cette
 * série, non. Les deux totaux ne se rejoignent qu'au 31.
 *
 * Conséquence à l'écran, connue et non résolue ici : `MonthCurve` force son
 * dernier point visible sur le total affiché, donc une dépense post-datée
 * apparaît comme une marche verticale sur AUJOURD'HUI plutôt qu'au jour qu'elle
 * porte. La courbe reste d'accord avec le chiffre du hero — c'est ce qui
 * compte le plus — mais elle place la dépense au mauvais jour. Ticket à ouvrir.
 *
 * D'où deux choix qui n'en sont pas vraiment :
 *
 * - **Tout se calcule en `Decimal`**, et la conversion en `number` n'a lieu
 *   qu'à la sortie. Additionner des flottants sur trente jours fabrique des
 *   restes qui n'existent dans aucune donnée, et il suffit d'un centime pour
 *   casser l'égalité ci-dessus.
 * - **La période est un paramètre**, pas une déduction. `month-situation.ts`
 *   refiltre déjà délibérément par `snapshot.currentPeriod` plutôt que de faire
 *   confiance à ce que la requête a rendu ; le même soin s'applique ici, sans
 *   quoi août 2025 et août 2026 s'empileraient sur la même courbe.
 *
 * Pure : aucun import Supabase, aucune horloge. Les jours du mois arrivent
 * calculés, parce que celui qui appelle sait déjà de quel mois il parle.
 */

/** Ce qu'il faut d'une dépense pour la placer sur un jour. */
export type DepenseDatee = {
  occurredOn: string;
  amount: Decimal;
};

export type JourDeDepense = {
  /** 1 à `joursDuMois`. */
  jour: number;
  /** Dépensé ce jour-là. */
  duJour: number;
  /** Dépensé du 1er à ce jour, celui-ci inclus. */
  cumule: number;
};

/**
 * `YYYY-MM-DD` → le jour du mois, ou `null` si la date ne relève pas de la
 * période demandée.
 *
 * Lecture par découpage plutôt que par `new Date()` : `occurredOn` est une date
 * civile, sans heure ni fuseau, et la passer par un `Date` la ferait basculer
 * d'un jour selon le fuseau du serveur. Une dépense du 1er août datée en UTC−2
 * tomberait en juillet.
 */
function jourDansLaPeriode(
  occurredOn: string,
  ref: { year: number; month: number },
  joursDuMois: number,
): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(occurredOn);
  if (!m) return null;

  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (annee !== ref.year || mois !== ref.month) return null;

  // Un jour hors des bornes est RATTACHÉ au bord, jamais écarté — et c'est
  // l'invariant de réconciliation qui l'impose, pas la commodité.
  //
  // `depensesDuMois` filtre sur le préfixe `YYYY-MM-` et ne regarde pas le
  // quantième : un `2026-08-31` dans un mois de trente jours entre dans SON
  // total. L'écarter d'ici ferait diverger la courbe du chiffre qu'elle
  // décompose — un écart silencieux, invisible en revue, et impossible à
  // expliquer à qui le voit à l'écran.
  //
  // Le cas ne peut naître que d'un appel incohérent (une période et un nombre
  // de jours qui ne parlent pas du même mois). Le rattachement ne prétend donc
  // pas corriger la donnée : il garantit que les deux lectures du même total
  // restent d'accord quoi qu'on leur donne.
  return Math.min(Math.max(jour, 1), joursDuMois);
}

export function depensesParJour(
  expenses: readonly DepenseDatee[],
  ref: { year: number; month: number },
  joursDuMois: number,
): JourDeDepense[] {
  // `<= 0` ne suffisait PAS, et ça se mesure : `NaN <= 0` vaut `false`, donc le
  // garde laissait passer — puis `Math.min(Math.max(jour, 1), NaN)` rendait
  // `NaN`, qui n'est pas `null`, et l'indexation `parJour[NaN]` lançait un
  // `TypeError`. Un `30.5` faisait la même chose par l'indice `29.5`, et
  // `Infinity` levait un `RangeError` sur la longueur du tableau.
  //
  // Cette fonction est appelée depuis un Server Component : un jet ici, c'est
  // le cockpit ENTIER en HTTP 500, pas une courbe manquante. Le commentaire du
  // test disait déjà « `joursDuMois` vient d'un calcul » — il ne couvrait qu'une
  // seule des façons dont un calcul se trompe.
  if (!Number.isInteger(joursDuMois) || joursDuMois <= 0) return [];

  const parJour = Array.from({ length: joursDuMois }, () => new Decimal(0));

  for (const depense of expenses) {
    const jour = jourDansLaPeriode(depense.occurredOn, ref, joursDuMois);
    if (jour === null) continue;
    parJour[jour - 1] = parJour[jour - 1]!.plus(depense.amount);
  }

  const serie: JourDeDepense[] = [];
  let cumule = new Decimal(0);
  for (let i = 0; i < joursDuMois; i++) {
    const duJour = parJour[i]!;
    cumule = cumule.plus(duJour);
    serie.push({ jour: i + 1, duJour: duJour.toNumber(), cumule: cumule.toNumber() });
  }
  return serie;
}
