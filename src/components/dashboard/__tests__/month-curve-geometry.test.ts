import { describe, expect, it } from 'vitest';

import {
  CURVE_HEIGHT,
  CURVE_END_HALF_HEIGHT,
  CURVE_PAD_BOTTOM,
  CURVE_PAD_TOP,
  CURVE_PAD_X,
  CURVE_WIDTH,
  monthCurveGeometry,
  type MonthCurveGeometryInput,
} from '../month-curve-geometry';

/**
 * La géométrie de la courbe du mois — **la moitié « tracé » du composant**.
 *
 * Le plan exige que `MonthCurve` soit « scindé, pas rogné » : tracé (géométrie
 * pure) d'un côté, états (couleur, libellé, projection conditionnelle,
 * `aria-label`) de l'autre. Ce fichier tient le premier. Il ne connaît ni
 * traduction, ni jeton de couleur, ni React : des nombres entrent, des chaînes
 * de chemin SVG sortent.
 *
 * Ce que ça achète : les onze cas que `PaceBar.test.tsx` protégeait — division
 * par zéro, budget négatif, dépense négative, repère qui sort de la piste —
 * s'écrivent ici en assertions arithmétiques, sans monter un DOM. Un cas de
 * géométrie qui échoue nomme la formule fautive, pas « le composant ne rend
 * pas ».
 */

const PLOT_HEIGHT = CURVE_HEIGHT - CURVE_PAD_TOP - CURVE_PAD_BOTTOM;

/** Un mois d'août ordinaire, rien de dépensé. */
function entree(over: Partial<MonthCurveGeometryInput> = {}): MonthCurveGeometryInput {
  return {
    serie: [],
    joursEcoules: 1,
    joursDuMois: 31,
    budgetDuMois: 1000,
    projection: null,
    ...over,
  };
}

/** Une série linéaire : `parJour` dépensé chaque jour, cumulé. */
function serieLineaire(jusquA: number, parJour: number) {
  return Array.from({ length: jusquA }, (_, i) => ({
    jour: i + 1,
    cumule: parJour * (i + 1),
  }));
}

/** Extrait les couples de coordonnées d'un chemin SVG. */
function points(path: string): Array<[number, number]> {
  return [...path.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

describe('monthCurveGeometry — le repère', () => {
  it('place le premier jour à gauche et le dernier à droite', () => {
    const g = monthCurveGeometry(entree({ serie: serieLineaire(31, 10), joursEcoules: 31 }));
    const p = points(g.linePath!);
    expect(p[0]?.[0]).toBe(CURVE_PAD_X);
    expect(p.at(-1)?.[0]).toBe(CURVE_WIDTH - CURVE_PAD_X);
  });

  it('respecte les marges haute et basse', () => {
    // La projection porte un point terminal dessiné avec un rayon : sans marge
    // il serait rogné par le bord du viewBox, et un point à moitié coupé se lit
    // comme un défaut de rendu.
    const g = monthCurveGeometry(
      entree({ serie: serieLineaire(31, 100), joursEcoules: 31, budgetDuMois: 3100 }),
    );
    for (const [, y] of points(g.linePath!)) {
      expect(y).toBeGreaterThanOrEqual(CURVE_PAD_TOP);
      expect(y).toBeLessThanOrEqual(CURVE_HEIGHT - CURVE_PAD_BOTTOM);
    }
  });

  it('met le zéro en bas quand rien n’est négatif', () => {
    const g = monthCurveGeometry(entree({ serie: serieLineaire(5, 10), joursEcoules: 5 }));
    expect(g.baselineY).toBe(CURVE_PAD_TOP + PLOT_HEIGHT);
  });

  it('rend des coordonnées finies, jamais NaN', () => {
    // Une seule valeur non finie suffit à faire disparaître le tracé ENTIER :
    // un `d` invalide n'est pas dessiné partiellement, il n'est pas dessiné.
    const g = monthCurveGeometry(entree({ serie: serieLineaire(10, 7.77), joursEcoules: 10 }));
    for (const [x, y] of points(g.linePath!)) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });
});

describe('monthCurveGeometry — le tracé du réel', () => {
  it('s’arrête au jour écoulé, pas au bout de la série', () => {
    // La série couvre tout le mois ; la courbe du RÉEL ne va que jusqu'à
    // aujourd'hui. Tracer au-delà afficherait des zéros futurs comme si
    // c'étaient des jours sans dépense — une affirmation sur l'avenir.
    const g = monthCurveGeometry(
      entree({ serie: serieLineaire(31, 10), joursEcoules: 10, joursDuMois: 31 }),
    );
    expect(points(g.linePath!)).toHaveLength(10);
    expect(g.todayPoint?.x).toBeCloseTo(
      CURVE_PAD_X + (9 / 30) * (CURVE_WIDTH - CURVE_PAD_X * 2),
      6,
    );
  });

  it('monte quand le cumulé monte', () => {
    const g = monthCurveGeometry(entree({ serie: serieLineaire(5, 10), joursEcoules: 5 }));
    const ys = points(g.linePath!).map(([, y]) => y);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]!).toBeLessThan(ys[i - 1]!);
    }
  });

  it('ferme l’aire sur la ligne de zéro, jamais sur le bas du cadre', () => {
    // Avec un remboursement, la ligne de zéro n'est PAS le bas du cadre. Fermer
    // l'aire sur le bord peindrait une surface sous zéro qui ne représente rien.
    const g = monthCurveGeometry(
      entree({
        serie: [
          { jour: 1, cumule: -50 },
          { jour: 2, cumule: 20 },
        ],
        joursEcoules: 2,
        joursDuMois: 2,
      }),
    );
    expect(g.baselineY).toBeLessThan(CURVE_HEIGHT - CURVE_PAD_BOTTOM);
    expect(g.areaPath).toContain(String(g.baselineY));
  });

  it('rend `null` quand il n’y a rien à tracer', () => {
    const g = monthCurveGeometry(entree({ serie: [], joursEcoules: 1 }));
    expect(g.linePath).toBeNull();
    expect(g.areaPath).toBeNull();
    expect(g.todayPoint).toBeNull();
  });
});

describe('monthCurveGeometry — la référence de rythme', () => {
  it('va de zéro le premier jour au budget le dernier', () => {
    const g = monthCurveGeometry(entree({ budgetDuMois: 1000, joursDuMois: 31 }));
    const [debut, fin] = points(g.pacePath!);
    expect(debut).toEqual([CURVE_PAD_X, g.baselineY]);
    expect(fin?.[0]).toBe(CURVE_WIDTH - CURVE_PAD_X);
    expect(fin?.[1]).toBeCloseTo(CURVE_PAD_TOP, 6);
  });

  it('disparaît quand le budget est nul ou négatif', () => {
    // Repris de `PaceBar:86`. Un budget non positif n'a aucune proportion à
    // montrer : une piste vide dit la vérité, une barre rouge pleine porterait
    // un jugement que le chiffre du hero porte déjà.
    for (const budgetDuMois of [0, -250]) {
      expect(monthCurveGeometry(entree({ budgetDuMois })).pacePath).toBeNull();
    }
  });
});

describe('monthCurveGeometry — la projection', () => {
  it('part d’aujourd’hui et arrive au dernier jour', () => {
    const g = monthCurveGeometry(
      entree({ serie: serieLineaire(10, 10), joursEcoules: 10, projection: 310 }),
    );
    const [depart, arrivee] = points(g.projectionPath!);
    expect(depart).toEqual([g.todayPoint!.x, g.todayPoint!.y]);
    expect(arrivee?.[0]).toBe(CURVE_WIDTH - CURVE_PAD_X);
    expect(g.projectionEnd).toEqual({ x: arrivee![0], y: arrivee![1] });
  });

  it('garde le marqueur terminal ENTIER dans le cadre', () => {
    // La propriété que `PaceBar` protégeait sous une autre forme — « repère
    // borné à 99,2, sinon il sort de la piste » — et que la PREMIÈRE version de
    // cette géométrie avait perdue : `x(joursDuMois)` se simplifie toujours à
    // `CURVE_WIDTH`, donc le marqueur de fin était centré SUR le bord droit et
    // coupé en deux par le viewBox. Visible à la capture du 24 août 2026, tous
    // les jours du mois où une projection existe — c'est-à-dire la plupart.
    const g = monthCurveGeometry(
      entree({ serie: serieLineaire(10, 10), joursEcoules: 10, projection: 310 }),
    );
    expect(g.projectionEnd!.x + CURVE_END_HALF_HEIGHT).toBeLessThanOrEqual(CURVE_WIDTH);
    expect(g.projectionEnd!.x - CURVE_END_HALF_HEIGHT).toBeGreaterThanOrEqual(0);
  });

  it('n’existe pas avant le septième jour', () => {
    // ADR-035 : `epargneEstimee` vaut `null` tant que `joursEcoules < 7`. Le
    // composant ne reçoit alors pas de projection, et la courbe ne doit rien
    // inventer pour combler la place.
    const g = monthCurveGeometry(
      entree({ serie: serieLineaire(3, 10), joursEcoules: 3, projection: null }),
    );
    expect(g.projectionPath).toBeNull();
    expect(g.projectionEnd).toBeNull();
  });

  it('n’existe pas non plus le dernier jour du mois', () => {
    // Une projection dont le départ et l'arrivée sont le même point est un
    // segment de longueur nulle : invisible, mais son point terminal se
    // superposerait à celui du réel et doublerait le marqueur.
    const g = monthCurveGeometry(
      entree({ serie: serieLineaire(31, 10), joursEcoules: 31, projection: 320 }),
    );
    expect(g.projectionPath).toBeNull();
    expect(g.projectionEnd).toBeNull();
  });

  it('reste dans le cadre quand elle dépasse largement le budget', () => {
    // Le cas qui distingue une courbe d'une barre : `PaceBar` PLAFONNAIT le
    // remplissage à 100 %. Plafonner une projection la ferait mentir — elle
    // doit sortir du budget visiblement, donc l'échelle s'ouvre pour elle.
    const g = monthCurveGeometry(
      entree({
        serie: serieLineaire(10, 200),
        joursEcoules: 10,
        budgetDuMois: 1000,
        projection: 6200,
      }),
    );
    expect(g.projectionEnd!.y).toBeGreaterThanOrEqual(CURVE_PAD_TOP);
    const [, paceFin] = points(g.pacePath!);
    expect(paceFin![1]).toBeGreaterThan(g.projectionEnd!.y);
  });
});

describe('monthCurveGeometry — les échéances marquées', () => {
  it('place chaque échéance sur son jour', () => {
    const g = monthCurveGeometry(entree({ billDays: [1, 16, 31], joursDuMois: 31 }));
    expect(g.billMarks.map((b) => b.x)).toEqual([
      CURVE_PAD_X,
      CURVE_WIDTH / 2,
      CURVE_WIDTH - CURVE_PAD_X,
    ]);
  });

  it('écarte une échéance hors du mois', () => {
    // Ici on ÉCARTE au lieu de rattacher au bord, à l'inverse de
    // `depensesParJour`. La raison est différente : cette liste ne compose
    // aucun total, donc rien ne diverge si un élément disparaît — alors qu'un
    // marqueur collé au 31 annoncerait une échéance à une date fausse.
    const g = monthCurveGeometry(entree({ billDays: [0, 5, 40], joursDuMois: 31 }));
    expect(g.billMarks.map((b) => b.jour)).toEqual([5]);
  });
});

describe('monthCurveGeometry — les entrées dégénérées', () => {
  it('supporte un mois de zéro jour sans diviser par zéro', () => {
    // Repris de `PaceBar:94`.
    const g = monthCurveGeometry(entree({ joursDuMois: 0, joursEcoules: 0, serie: [] }));
    expect(g.linePath).toBeNull();
    expect(g.pacePath).toBeNull();
    expect(g.projectionPath).toBeNull();
    expect(g.billMarks).toEqual([]);
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [30.5]])(
    'refuse un joursDuMois à %p sans empoisonner les coordonnées',
    (joursDuMois) => {
      // `NaN <= 0` vaut `false` : l'ancien garde laissait passer, `denom`
      // devenait `NaN`, et CHAQUE coordonnée avec lui. Un `d` contenant `NaN`
      // n'est pas dessiné partiellement — il n'est pas dessiné du tout, et la
      // page perd sa courbe sans qu'aucune erreur ne soit levée.
      const g = monthCurveGeometry(
        entree({ serie: serieLineaire(5, 10), joursEcoules: 5, joursDuMois }),
      );
      expect(g.linePath).toBeNull();
      expect(g.pacePath).toBeNull();
      expect(g.billMarks).toEqual([]);
    },
  );

  it('supporte un mois d’un seul jour', () => {
    const g = monthCurveGeometry(
      entree({ serie: [{ jour: 1, cumule: 40 }], joursEcoules: 1, joursDuMois: 1 }),
    );
    expect(points(g.linePath!)).toHaveLength(1);
    expect(Number.isFinite(g.todayPoint!.x)).toBe(true);
  });

  it('supporte un mois entièrement à zéro', () => {
    const g = monthCurveGeometry(entree({ serie: serieLineaire(5, 0), joursEcoules: 5 }));
    expect(points(g.linePath!).every(([, y]) => y === g.baselineY)).toBe(true);
  });

  it('borne le jour écoulé à la longueur de la série', () => {
    // Un `joursEcoules` plus grand que la série arrive dès qu'un appelant
    // calcule les deux séparément. Lire au-delà rendrait `undefined`, donc un
    // `NaN`, donc AUCUN tracé — une page qui perd sa courbe sans erreur.
    const g = monthCurveGeometry(entree({ serie: serieLineaire(3, 10), joursEcoules: 99 }));
    expect(points(g.linePath!)).toHaveLength(3);
  });

  it('borne le jour écoulé à 1 au minimum', () => {
    const g = monthCurveGeometry(entree({ serie: serieLineaire(5, 10), joursEcoules: 0 }));
    expect(points(g.linePath!)).toHaveLength(1);
  });
});
