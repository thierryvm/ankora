import Decimal from 'decimal.js';

/**
 * La série que la courbe du mois trace : dépensé par jour, et cumulé.
 *
 * ## L'invariant, et pourquoi il est la raison d'être de ce fichier
 *
 * **Le cumulé au dernier jour écoulé vaut « Dépensé ce mois » au centime.**
 * Cette fonction ne recalcule pas un total qui existe ailleurs pour l'afficher
 * autrement — elle le décompose. Si les deux divergent, l'écran affiche un
 * chiffre et une courbe qui se contredisent, sur la seule question que la page
 * pose.
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
  if (joursDuMois <= 0) return [];

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
