import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { announceOptimisticSpend, settleSpend } from '@/lib/expenses/optimistic-spend';

import { MonthCurve, type MonthCurveProps } from '../MonthCurve';
import { MonthCurveLive } from '../MonthCurveLive';

/**
 * Le raccord entre la courbe et le magasin optimiste.
 *
 * Le vrai magasin, pas un doublon : c'est le couplage lui-même qu'on teste, et
 * un doublon ne prouverait que ma capacité à écrire un doublon.
 */

const base: MonthCurveProps = {
  serie: Array.from({ length: 10 }, (_, i) => ({ jour: i + 1, cumule: 25 * (i + 1) })),
  joursEcoules: 10,
  joursDuMois: 31,
  budgetDuMois: 1000,
  depensesDuMois: 250,
  projection: null,
  labels: {
    aria: '250 € dépensés sur 1 000 € de budget, au jour 10 sur 31.',
    reel: 'Dépensé',
    rythme: 'Rythme régulier',
    projection: 'Estimation',
    verdict: 'dans le rythme',
  },
};

const chemin = () => screen.getByTestId('month-curve-line').getAttribute('d');

afterEach(() => {
  act(() => settleSpend());
});

describe('MonthCurveLive — suivre le hero', () => {
  it('trace la vérité serveur tant que rien n’est en attente', () => {
    // La même courbe, sans le raccord : le magasin vide ne doit rien changer.
    const { unmount } = render(<MonthCurveLive {...base} />);
    const avecRaccord = chemin();
    unmount();
    render(<MonthCurve {...base} />);
    expect(chemin()).toBe(avecRaccord);
  });

  it('suit la figure optimiste dès qu’elle est publiée', () => {
    render(<MonthCurveLive {...base} />);
    const avant = chemin();
    act(() => announceOptimisticSpend({ ilTeReste: 300, depensesDuMois: 700 }));
    expect(chemin()).not.toBe(avant);
  });

  it('lit « Dépensé ce mois » du couple, jamais l’autre membre', () => {
    // Se brancher sur `ilTeReste` produirait une courbe qui DESCEND quand on
    // dépense — plausible à l'œil, et fausse par toute la hauteur du graphique.
    const { unmount } = render(<MonthCurveLive {...base} />);
    act(() => announceOptimisticSpend({ ilTeReste: 300, depensesDuMois: 700 }));
    const parLeMagasin = chemin();
    unmount();

    // **Solder avant de comparer.** `unmount()` ne vide pas le magasin : sans
    // cette ligne le second rendu relit la même valeur en attente, et le cas
    // compare la mutation à elle-même. Mesuré — une version branchée sur
    // `ilTeReste` passait les quatre cas de ce fichier.
    act(() => settleSpend());

    // La même image obtenue sans magasin, en passant 700 en clair.
    render(<MonthCurveLive {...base} depensesDuMois={700} />);
    expect(chemin()).toBe(parLeMagasin);
  });

  it('ne trace PAS « Il te reste », qui ferait descendre la courbe quand on dépense', () => {
    // La preuve directe, sans passer par une comparaison : le couple porte deux
    // nombres délibérément différents, et la courbe doit suivre le plus grand.
    // Une courbe qui descend en dépensant est plausible à l'œil et fausse de
    // toute la hauteur du graphique.
    const { unmount } = render(<MonthCurveLive {...base} depensesDuMois={700} />);
    const attendu = chemin();
    unmount();
    act(() => settleSpend());

    render(<MonthCurveLive {...base} />);
    act(() => announceOptimisticSpend({ ilTeReste: 300, depensesDuMois: 700 }));
    expect(chemin()).toBe(attendu);
  });

  it('revient à la vérité serveur quand on solde', () => {
    render(<MonthCurveLive {...base} />);
    const serveur = chemin();
    act(() => announceOptimisticSpend({ ilTeReste: 300, depensesDuMois: 700 }));
    act(() => settleSpend());
    expect(chemin()).toBe(serveur);
  });
});
