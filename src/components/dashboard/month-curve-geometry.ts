/**
 * La géométrie de la courbe du mois — **la moitié « tracé »** de `MonthCurve`.
 *
 * Le plan de refonte exige que ce composant soit « scindé, pas rogné » : la
 * géométrie ici, les états (couleur, libellé, `aria-label`) dans le composant.
 * Ce module ne connaît ni React, ni traduction, ni jeton de couleur — des
 * nombres entrent, des chaînes de chemin SVG sortent. Il se teste donc sans
 * monter un DOM, et un cas rouge nomme la formule fautive plutôt que « le
 * composant ne rend pas ».
 *
 * ## Ce que la courbe change par rapport à la barre qu'elle remplace
 *
 * `PaceBar` **plafonnait** son remplissage à 100 % : au-delà du budget, la
 * barre était pleine et le dépassement invisible. Une courbe ne peut pas se
 * permettre ça — l'échelle s'ouvre pour contenir le pire des trois (budget,
 * cumulé réel, projection), et le dépassement se voit sortir de la référence.
 *
 * ## Segments droits, jamais une courbe lissée
 *
 * Le kit de référence lisse ses tracés. Refusé ici : un lissage invente des
 * valeurs entre deux jours, et l'écran affiche des euros. Entre le 3 et le 4,
 * il ne s'est rien passé qu'on puisse dessiner — la ligne droite le dit, une
 * courbe de Bézier prétend le contraire.
 *
 * ## CSP
 *
 * Aucune valeur ne part en `style` inline : ce module ne rend que des chaînes
 * destinées à des ATTRIBUTS (`d`, `cx`, `cy`). `style-src` ne porte pas
 * `'unsafe-inline'` en production, un attribut `style` y est supprimé et la
 * forme disparaît. Même construction que `PaceBar` et `AllocationBar`.
 */

/** Largeur du repère, en unités de `viewBox`. Le SVG s'étire à la carte. */
export const CURVE_WIDTH = 100;
export const CURVE_HEIGHT = 44;
/** Marges : le point terminal de la projection a un rayon, il ne doit pas être rogné. */
export const CURVE_PAD_TOP = 4;
export const CURVE_PAD_BOTTOM = 4;

const PLOT_HEIGHT = CURVE_HEIGHT - CURVE_PAD_TOP - CURVE_PAD_BOTTOM;

/** Un point de la série cumulée — ce que rend `depensesParJour`. */
export type CurvePoint = { jour: number; cumule: number };

export type MonthCurveGeometryInput = {
  /** La série du mois, un point par jour, cumulée. */
  serie: readonly CurvePoint[];
  /** Jour du mois d'aujourd'hui, celui-ci inclus. */
  joursEcoules: number;
  joursDuMois: number;
  /** « Budget du mois » — la référence de rythme. */
  budgetDuMois: number;
  /** Fin de mois estimée, ou `null` (ADR-035 : rien avant le 7e jour). */
  projection: number | null;
  /** Jours portant une échéance à marquer. Le tri et le filtrage de produit sont à l'appelant. */
  billDays?: readonly number[];
};

export type MonthCurveGeometry = {
  /** Ordonnée du zéro. **Pas** forcément le bas du cadre : un remboursement descend en dessous. */
  baselineY: number;
  /** Le cumulé réel, du 1er à aujourd'hui. `null` s'il n'y a rien à tracer. */
  linePath: string | null;
  /** Le même tracé refermé sur la ligne de zéro, pour le dégradé. */
  areaPath: string | null;
  /** La référence de rythme : zéro le 1er, budget le dernier jour. */
  pacePath: string | null;
  /** La continuation estimée, d'aujourd'hui au dernier jour. */
  projectionPath: string | null;
  projectionEnd: { x: number; y: number } | null;
  /** Où le réel s'arrête aujourd'hui. */
  todayPoint: { x: number; y: number } | null;
  billMarks: Array<{ jour: number; x: number }>;
};

/**
 * Deux décimales partout, et `-0` ramené à `0`.
 *
 * L'arrondi n'est pas cosmétique : `baselineY` est comparé aux coordonnées
 * qu'il produit dans `areaPath`, et deux écritures d'un même nombre ne se
 * reconnaîtraient pas. `-0` parce qu'il s'imprime `"-0"` dans un chemin et
 * qu'il n'est pas égal à `0` pour `Object.is`.
 */
function r(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v;
}

export function monthCurveGeometry({
  serie,
  joursEcoules,
  joursDuMois,
  budgetDuMois,
  projection,
  billDays = [],
}: MonthCurveGeometryInput): MonthCurveGeometry {
  // Un mois sans jour n'a pas de repère. Rendre des chemins vides plutôt que de
  // diviser par zéro : un `d` contenant `NaN` ne dessine pas « à peu près », il
  // ne dessine RIEN, et la page perd sa courbe sans qu'une erreur soit levée.
  if (joursDuMois <= 0) {
    return {
      baselineY: CURVE_PAD_TOP + PLOT_HEIGHT,
      linePath: null,
      areaPath: null,
      pacePath: null,
      projectionPath: null,
      projectionEnd: null,
      todayPoint: null,
      billMarks: [],
    };
  }

  // Un mois d'un seul jour n'a pas d'intervalle : sans ce plancher, la division
  // rendrait l'infini pour tout point.
  const denom = Math.max(1, joursDuMois - 1);
  const x = (jour: number) => r(((jour - 1) / denom) * CURVE_WIDTH);

  const visibles = serie.slice(0, Math.max(1, Math.min(joursEcoules, serie.length)));
  const cumules = visibles.map((p) => p.cumule);

  // L'échelle contient le pire des trois. Plafonner ferait mentir la projection
  // — c'est précisément ce que la barre remplacée faisait.
  const yMin = Math.min(0, ...cumules);
  let yMax = Math.max(0, budgetDuMois, ...cumules, projection ?? 0);
  if (yMax <= yMin) yMax = yMin + 1;
  const span = yMax - yMin;

  const y = (valeur: number) => r(CURVE_PAD_TOP + ((yMax - valeur) / span) * PLOT_HEIGHT);
  const baselineY = y(0);

  const coords = visibles.map((p) => [x(p.jour), y(p.cumule)] as const);
  const linePath = coords.length
    ? coords.map(([px, py], i) => `${i === 0 ? 'M' : 'L'} ${px} ${py}`).join(' ')
    : null;

  // L'aire se referme sur la ligne de ZÉRO, pas sur le bas du cadre : sous zéro,
  // peindre jusqu'au bord colorierait une surface qui ne représente rien.
  const areaPath =
    linePath && coords.length > 1
      ? `${linePath} L ${coords.at(-1)![0]} ${baselineY} L ${coords[0]![0]} ${baselineY} Z`
      : null;

  const todayPoint = coords.length ? { x: coords.at(-1)![0], y: coords.at(-1)![1] } : null;

  // Budget non positif : aucune proportion à montrer. Une piste vide dit la
  // vérité ; le chiffre du hero porte déjà le constat. Reprise de `PaceBar:86`.
  const pacePath =
    budgetDuMois > 0 && joursDuMois > 1
      ? `M ${x(1)} ${baselineY} L ${x(joursDuMois)} ${y(budgetDuMois)}`
      : null;

  // Pas de projection sans point de départ, sans estimation (ADR-035 : rien
  // avant le 7e jour), ni le dernier jour — un segment de longueur nulle
  // doublerait le marqueur du réel au lieu d'ajouter une information.
  let projectionEnd: { x: number; y: number } | null = null;
  let projectionPath: string | null = null;
  if (
    todayPoint &&
    projection !== null &&
    Number.isFinite(projection) &&
    (visibles.at(-1)?.jour ?? 0) < joursDuMois
  ) {
    projectionEnd = { x: x(joursDuMois), y: y(projection) };
    projectionPath = `M ${todayPoint.x} ${todayPoint.y} L ${projectionEnd.x} ${projectionEnd.y}`;
  }

  // Écartées et non rattachées au bord, à l'inverse de `depensesParJour` : cette
  // liste ne compose aucun total, donc rien ne diverge si un élément disparaît —
  // alors qu'un marqueur collé au 31 annoncerait une échéance à une date fausse.
  const billMarks = billDays
    .filter((jour) => Number.isInteger(jour) && jour >= 1 && jour <= joursDuMois)
    .map((jour) => ({ jour, x: x(jour) }));

  return {
    baselineY,
    linePath,
    areaPath,
    pacePath,
    projectionPath,
    projectionEnd,
    todayPoint,
    billMarks,
  };
}
