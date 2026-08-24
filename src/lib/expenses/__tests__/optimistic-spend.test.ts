import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  announceOptimisticValue,
  settleSpend,
  useOptimisticValue,
} from '@/lib/expenses/optimistic-spend';

/**
 * Le magasin optimiste — écrit AVANT d'en changer la forme.
 *
 * ## Pourquoi ce fichier apparaît maintenant
 *
 * Ce magasin n'avait aucun test dédié. Il était couvert **de biais** par
 * `HeroAmount.test.tsx`, qui importe le vrai module plutôt qu'un doublon et
 * exerce donc l'idempotence et le garde `Number.isFinite` — mais à travers un
 * composant, et seulement pour ce que ce composant en fait.
 *
 * La refonte du cockpit va lui faire porter **deux** figures au lieu d'une, pour
 * que la courbe du mois suive le montant du hero au lieu de rester figée à côté
 * de lui pendant une seconde. Un test écrit APRÈS ce changement prouverait que le
 * nouveau code fait ce que le nouveau code fait ; écrit avant, il prouve que le
 * comportement a survécu. C'est la seule raison d'être de ce fichier, et elle
 * suffit.
 *
 * ## Ce qui est asserté, et pourquoi c'est ce qui compte
 *
 * L'en-tête du module explique qu'il publie la **figure résultante** et non un
 * delta, précisément pour que l'opération soit idempotente : appliquer deux fois
 * revient à appliquer une fois, donc aucun ordre d'arrivée entre l'action qui se
 * résout et la charge RSC ne peut produire une image fausse. C'est cette
 * propriété-là qu'il faut protéger — pas la forme du stockage, qui va changer.
 */
afterEach(() => {
  // Le magasin est un module, donc partagé entre les cas. Sans cette remise à
  // zéro, un cas qui publie laisse sa valeur au suivant et les échecs se
  // déplacent d'un test à l'autre au gré de l'ordre d'exécution.
  act(() => settleSpend());
});

describe('optimistic-spend — ce que le hero lit', () => {
  it('ne publie rien tant que personne n’a dépensé', () => {
    const { result } = renderHook(() => useOptimisticValue());
    expect(result.current).toBeNull();
  });

  it('publie la figure annoncée, et la rend au lecteur', () => {
    const { result } = renderHook(() => useOptimisticValue());
    act(() => announceOptimisticValue(429.89));
    expect(result.current).toBe(429.89);
  });

  it('prévient tous les lecteurs, pas seulement le dernier monté', () => {
    // Deux composants lisent le même magasin dans l'application réelle — le
    // montant du hero, et bientôt la courbe. Un `emit` qui ne réveillerait que
    // le dernier abonné les ferait diverger, ce qui est exactement le défaut
    // que ce magasin existe pour empêcher.
    const a = renderHook(() => useOptimisticValue());
    const b = renderHook(() => useOptimisticValue());
    act(() => announceOptimisticValue(120.5));
    expect(a.result.current).toBe(120.5);
    expect(b.result.current).toBe(120.5);
  });

  it('est idempotent : deux annonces de la même figure valent une', () => {
    const { result } = renderHook(() => useOptimisticValue());
    act(() => announceOptimisticValue(300));
    act(() => announceOptimisticValue(300));
    expect(result.current).toBe(300);
  });

  it('remplace la figure plutôt que de l’accumuler', () => {
    // Le corollaire de « publier le résultat et non un delta » : une seconde
    // dépense annonce le NOUVEAU total restant, elle ne se soustrait pas au
    // précédent. Un magasin qui cumulerait rendrait 129,89 ici.
    const { result } = renderHook(() => useOptimisticValue());
    act(() => announceOptimisticValue(429.89));
    act(() => announceOptimisticValue(300));
    expect(result.current).toBe(300);
  });

  it('rend la main à la vérité serveur quand on solde', () => {
    const { result } = renderHook(() => useOptimisticValue());
    act(() => announceOptimisticValue(429.89));
    act(() => settleSpend());
    expect(result.current).toBeNull();
  });

  it('supporte d’être soldé deux fois de suite', () => {
    // Le hero solde à chaque arrivée de vérité serveur, la feuille solde aussi
    // en cas d'échec : les deux peuvent tomber coup sur coup.
    const { result } = renderHook(() => useOptimisticValue());
    act(() => announceOptimisticValue(50));
    act(() => settleSpend());
    act(() => settleSpend());
    expect(result.current).toBeNull();
  });
});

describe('optimistic-spend — ce qu’il refuse', () => {
  it.each([[NaN], [Infinity], [-Infinity]])(
    'ignore %p plutôt que de l’afficher',
    (valeurInvalide) => {
      // Un champ à moitié saisi produit un NaN. Sans ce garde, le hero
      // afficherait « NaN € » — une panne visible, sur le chiffre le plus lu
      // de l'application.
      const { result } = renderHook(() => useOptimisticValue());
      act(() => announceOptimisticValue(valeurInvalide));
      expect(result.current).toBeNull();
    },
  );

  it('ne détruit pas une figure valide quand une invalide arrive après', () => {
    const { result } = renderHook(() => useOptimisticValue());
    act(() => announceOptimisticValue(429.89));
    act(() => announceOptimisticValue(NaN));
    expect(result.current).toBe(429.89);
  });

  it('accepte zéro et les valeurs négatives', () => {
    // « Il te reste » a le droit d'être nul ou négatif : c'est un fait, pas une
    // valeur invalide. Confondre « non fini » et « non positif » masquerait
    // exactement le mois qu'il est le plus utile de voir.
    const { result } = renderHook(() => useOptimisticValue());
    act(() => announceOptimisticValue(0));
    expect(result.current).toBe(0);
    act(() => announceOptimisticValue(-42.5));
    expect(result.current).toBe(-42.5);
  });
});
