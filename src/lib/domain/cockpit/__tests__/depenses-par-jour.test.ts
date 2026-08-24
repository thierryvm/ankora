import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { depensesDuMois } from '../depenses-du-mois';
import { depensesParJour, type DepenseDatee } from '../depenses-par-jour';

/**
 * La série que la courbe du mois trace.
 *
 * ## Ce que ce fichier protège avant tout
 *
 * L'**invariant de réconciliation** : le cumulé au dernier jour écoulé vaut
 * « Dépensé ce mois » au centime. Deux calculs de la même somme finissent
 * toujours par diverger — `month-situation.ts` le dit déjà de sa propre main, et
 * c'est la maladie que la refonte soigne. Si cette série et le chiffre du hero
 * se contredisent d'un centime, l'écran ment sur le seul point où il ne peut pas
 * se permettre de mentir.
 *
 * D'où aussi le calcul en `Decimal` jusqu'au bout, converti en `number`
 * seulement à la sortie : additionner des flottants sur trente jours produit
 * des restes qui n'existent nulle part dans les données.
 */
const d = (jour: number, montant: string) => ({
  occurredOn: `2026-08-${String(jour).padStart(2, '0')}`,
  amount: new Decimal(montant),
});

const AOUT = { year: 2026, month: 8 };

describe('depensesParJour — la forme de la série', () => {
  it('rend un point par jour du mois, numérotés à partir de 1', () => {
    const serie = depensesParJour([], AOUT, 31);
    expect(serie).toHaveLength(31);
    expect(serie[0]?.jour).toBe(1);
    expect(serie[30]?.jour).toBe(31);
  });

  it('rend des nombres, jamais des Decimal', () => {
    // Ces valeurs traversent la frontière RSC pour atteindre un SVG. Un Decimal
    // y perd son prototype : la panne est déjà arrivée sur ce projet, et une
    // fixture qui passerait un nombre en entrée la masquerait au lieu de la
    // révéler — d'où de vrais Decimal ci-dessus.
    const serie = depensesParJour([d(3, '12.34')], AOUT, 31);
    expect(typeof serie[2]?.duJour).toBe('number');
    expect(typeof serie[2]?.cumule).toBe('number');
  });

  it('rend une série vide pour un mois sans jours', () => {
    // Défensif : `joursDuMois` vient d'un calcul, et une division par lui suit
    // dans le tracé. Zéro point vaut mieux qu'un point à l'infini.
    expect(depensesParJour([d(1, '10')], AOUT, 0)).toEqual([]);
  });
});

describe('depensesParJour — ce qu’elle additionne', () => {
  it('place chaque dépense sur son jour', () => {
    const serie = depensesParJour([d(1, '10'), d(5, '25.50')], AOUT, 31);
    expect(serie[0]?.duJour).toBe(10);
    expect(serie[4]?.duJour).toBe(25.5);
    expect(serie[1]?.duJour).toBe(0);
  });

  it('additionne plusieurs dépenses du même jour', () => {
    const serie = depensesParJour([d(7, '10.10'), d(7, '0.90'), d(7, '4')], AOUT, 31);
    expect(serie[6]?.duJour).toBe(15);
  });

  it('cumule depuis le premier jour, jour courant inclus', () => {
    const serie = depensesParJour([d(2, '10'), d(4, '5')], AOUT, 31);
    expect(serie[0]?.cumule).toBe(0);
    expect(serie[1]?.cumule).toBe(10);
    expect(serie[2]?.cumule).toBe(10);
    expect(serie[3]?.cumule).toBe(15);
    expect(serie[30]?.cumule).toBe(15);
  });

  it('additionne en Decimal, pas en flottant', () => {
    // 0.1 + 0.2 vaut 0.30000000000000004 en flottant. Sur trente jours de
    // courses, ces restes s'accumulent et le dernier point cesse d'égaler le
    // chiffre du hero — l'invariant de réconciliation tombe sans qu'aucune
    // ligne de code n'ait l'air fausse.
    const serie = depensesParJour([d(1, '0.1'), d(2, '0.2')], AOUT, 31);
    expect(serie[1]?.cumule).toBe(0.3);
  });
});

describe('depensesParJour — la période de référence', () => {
  it('ignore une dépense d’un autre mois', () => {
    const juillet = { occurredOn: '2026-07-15', amount: new Decimal('999') };
    const serie = depensesParJour([juillet, d(15, '10')], AOUT, 31);
    expect(serie[14]?.duJour).toBe(10);
    expect(serie[30]?.cumule).toBe(10);
  });

  it('ignore une dépense du même mois d’une AUTRE année', () => {
    // Le paramètre de période existe pour ce cas précis. Sans lui, un
    // `joursDuMois` seul ne distingue pas août 2025 d'août 2026, et un an de
    // dépenses s'empilerait sur la courbe du mois.
    const anDernier = { occurredOn: '2025-08-15', amount: new Decimal('999') };
    const serie = depensesParJour([anDernier, d(15, '10')], AOUT, 31);
    expect(serie[30]?.cumule).toBe(10);
  });

  it('rattache un jour hors bornes au dernier jour plutôt que de le perdre', () => {
    // Écrit d'abord dans l'autre sens — « ignore un jour hors bornes » — puis
    // corrigé en mesurant ce que fait `depensesDuMois` : elle filtre sur le
    // préfixe `YYYY-MM-` et ne regarde pas le quantième, donc un 31 dans un mois
    // de trente entre dans SON total. L'écarter d'ici ferait diverger la courbe
    // du chiffre qu'elle décompose.
    const serie = depensesParJour(
      [{ occurredOn: '2026-08-31', amount: new Decimal('7') }],
      AOUT,
      30,
    );
    expect(serie).toHaveLength(30);
    expect(serie[29]?.cumule).toBe(7);
  });
});

describe('depensesParJour — l’invariant de réconciliation', () => {
  // L'assertion qui justifie le fichier : le dernier cumulé vaut « Dépensé ce
  // mois » AU CENTIME. Comparé à la vraie fonction du domaine, jamais à une
  // valeur recopiée — un attendu écrit à la main prouverait seulement que
  // j'ai su additionner le jour où je l'ai écrit.
  const jeux: Array<[string, DepenseDatee[], number]> = [
    ['un mois vide', [], 31],
    ['une seule dépense', [d(12, '42.42')], 31],
    ['plusieurs le même jour', [d(3, '10.10'), d(3, '0.90'), d(3, '4')], 31],
    ['des centimes qui se cumulent mal en flottant', [d(1, '0.1'), d(2, '0.2'), d(3, '0.3')], 31],
    ['un remboursement', [d(2, '100'), d(9, '-30.55')], 30],
    ['une dépense chaque jour', Array.from({ length: 28 }, (_, i) => d(i + 1, '3.33')), 28],
  ];

  it.each(jeux)('%s : dernier cumulé = depensesDuMois', (_nom, expenses, joursDuMois) => {
    const serie = depensesParJour(expenses, AOUT, joursDuMois);
    const total = depensesDuMois(expenses as never, AOUT);
    const dernier = serie.at(-1)?.cumule ?? 0;
    expect(dernier).toBe(total.toNumber());
  });

  it('tient aussi quand une date hors bornes s’en mêle', () => {
    const expenses = [d(5, '20'), { occurredOn: '2026-08-31', amount: new Decimal('7') }];
    const serie = depensesParJour(expenses, AOUT, 30);
    expect(serie.at(-1)?.cumule).toBe(depensesDuMois(expenses as never, AOUT).toNumber());
  });
});

describe('depensesParJour — les entrées dégénérées', () => {
  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [30.5]])(
    'rend une série vide pour joursDuMois = %p, au lieu de LANCER',
    (joursDuMois) => {
      // Mesuré : `NaN <= 0` vaut `false`, donc l'ancien garde laissait passer,
      // puis `Math.min(Math.max(jour, 1), NaN)` rendait `NaN` — pas `null` — et
      // l'indexation `parJour[NaN]` lançait un `TypeError`. `30.5` faisait de
      // même par l'indice `29.5` ; `Infinity` levait un `RangeError` sur la
      // longueur du tableau.
      //
      // Cette fonction est appelée depuis un Server Component : un jet ici,
      // c'est le cockpit ENTIER en HTTP 500, pas une courbe manquante.
      expect(depensesParJour([d(1, '10')], AOUT, joursDuMois)).toEqual([]);
    },
  );

  it('ne rejoint « Dépensé ce mois » qu’au dernier jour DU MOIS, pas au jour écoulé', () => {
    // Le docblock a d'abord annoncé l'invariant « au dernier jour ÉCOULÉ ».
    // C'était plus fort que ce qui tient, et faux : rien n'empêche aujourd'hui
    // d'enregistrer une dépense datée plus tard dans le mois courant — ni le
    // champ date, ni le schéma Zod, ni une contrainte en base. `depensesDuMois`
    // la compte ; la portion écoulée de la série, non.
    //
    // Ce cas fige le comportement RÉEL plutôt que le comportement rêvé. La
    // conséquence à l'écran — la dépense post-datée apparaît comme une marche
    // sur AUJOURD'HUI, parce que le composant force son dernier point visible
    // sur le total affiché — est écrite dans le docblock et attend son ticket.
    const expenses = [d(5, '20'), d(28, '50')];
    const serie = depensesParJour(expenses, AOUT, 31);
    const total = depensesDuMois(expenses as never, AOUT).toNumber();

    expect(total).toBe(70);
    expect(serie[24 - 1]?.cumule).toBe(20);
    expect(serie.at(-1)?.cumule).toBe(total);
  });

  it('supporte une date illisible sans casser la série', () => {
    const serie = depensesParJour(
      [{ occurredOn: 'pas-une-date', amount: new Decimal('50') }, d(3, '10')],
      AOUT,
      31,
    );
    expect(serie[2]?.cumule).toBe(10);
    expect(serie[30]?.cumule).toBe(10);
  });

  it('accepte un montant négatif plutôt que de le taire', () => {
    // Un remboursement est une dépense négative. La courbe doit redescendre :
    // la masquer donnerait un cumulé qui ne correspond plus au hero, et c'est
    // exactement l'invariant qu'on protège.
    const serie = depensesParJour([d(2, '100'), d(5, '-30')], AOUT, 31);
    expect(serie[4]?.cumule).toBe(70);
  });

  it('rend une série de zéros quand rien n’a été dépensé', () => {
    const serie = depensesParJour([], AOUT, 30);
    expect(serie.every((p) => p.duJour === 0 && p.cumule === 0)).toBe(true);
  });
});
