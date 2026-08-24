import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  announceOptimisticSpend,
  settleSpend,
  useOptimisticSpend,
} from '@/lib/expenses/optimistic-spend';

/**
 * Le magasin optimiste — **écrit avant le changement de forme, adapté après**.
 *
 * ## Ce que ce fichier a servi à faire
 *
 * Il a été écrit alors que le magasin ne portait qu'UNE figure, contre le
 * comportement d'alors, et vu vert avant qu'une ligne du module ne bouge. Il
 * porte maintenant le couple, et chacune des propriétés d'origine a survécu
 * telle quelle : idempotence, remplacement plutôt qu'accumulation, réveil de
 * TOUS les abonnés, refus des valeurs non finies, acceptation de zéro et des
 * négatifs. C'était toute la raison de l'écrire d'abord.
 *
 * ## Ce que le couple ajoute
 *
 * Le hero affiche « Il te reste » et la courbe décompose « Dépensé ce mois ».
 * Publiés séparément, ils pourraient être purgés séparément — et l'écran se
 * contredirait sur la seule question qu'il pose. Publiés ensemble, cet état
 * n'est **pas représentable**. Les cas ci-dessous tiennent cette propriété-là,
 * pas la forme du stockage.
 */
const COUPLE = { ilTeReste: 429.89, depensesDuMois: 118.5 };

afterEach(() => {
  // Le magasin est un module, donc partagé entre les cas. Sans cette remise à
  // zéro, un cas qui publie laisse sa valeur au suivant et les échecs se
  // déplacent d'un test à l'autre au gré de l'ordre d'exécution.
  act(() => settleSpend());
});

describe('optimistic-spend — ce que l’écran lit', () => {
  it('ne publie rien tant que personne n’a dépensé', () => {
    const { result } = renderHook(() => useOptimisticSpend());
    expect(result.current).toBeNull();
  });

  it('publie les deux figures annoncées', () => {
    const { result } = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend(COUPLE));
    expect(result.current).toEqual(COUPLE);
  });

  it('prévient tous les lecteurs, pas seulement le dernier monté', () => {
    // Deux composants lisent ce magasin : le montant du hero et la courbe. Un
    // `emit` qui ne réveillerait que le dernier abonné les ferait diverger,
    // c'est-à-dire produirait exactement le défaut que ce magasin empêche.
    const a = renderHook(() => useOptimisticSpend());
    const b = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend(COUPLE));
    expect(a.result.current).toEqual(COUPLE);
    expect(b.result.current).toEqual(COUPLE);
  });

  it('rend la MÊME référence d’un rendu à l’autre', () => {
    // `useSyncExternalStore` compare les instantanés par référence. Reconstruire
    // l'objet à la lecture rendrait une identité neuve à chaque rendu et ferait
    // boucler le composant à l'infini — une page qui gèle, pas un test rouge.
    const { result, rerender } = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend(COUPLE));
    const premier = result.current;
    rerender();
    expect(result.current).toBe(premier);
  });

  it('ne suit pas les mutations ultérieures de l’objet appelant', () => {
    // L'appelant garde son objet et peut le modifier ensuite. Le stocker par
    // référence changerait ce que lisent les abonnés SANS `emit` : une
    // divergence silencieuse, et inattribuable le jour où elle se voit.
    const mutable = { ilTeReste: 100, depensesDuMois: 20 };
    const { result } = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend(mutable));
    mutable.ilTeReste = 999;
    expect(result.current?.ilTeReste).toBe(100);
  });
});

describe('optimistic-spend — les propriétés qui ont survécu au changement de forme', () => {
  it('est idempotent : deux annonces du même couple valent une', () => {
    const { result } = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend(COUPLE));
    act(() => announceOptimisticSpend(COUPLE));
    expect(result.current).toEqual(COUPLE);
  });

  it('remplace le couple plutôt que de l’accumuler', () => {
    // Le corollaire de « publier le résultat et non un delta » : une seconde
    // dépense annonce les NOUVEAUX totaux, elle ne se soustrait pas aux
    // précédents. Un magasin qui cumulerait rendrait 129,89 ici.
    const { result } = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend(COUPLE));
    act(() => announceOptimisticSpend({ ilTeReste: 300, depensesDuMois: 248.39 }));
    expect(result.current).toEqual({ ilTeReste: 300, depensesDuMois: 248.39 });
  });

  it('rend la main à la vérité serveur quand on solde', () => {
    const { result } = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend(COUPLE));
    act(() => settleSpend());
    expect(result.current).toBeNull();
  });

  it('supporte d’être soldé deux fois de suite', () => {
    // Le hero solde à chaque arrivée de vérité serveur, la feuille solde aussi
    // en cas d'échec : les deux peuvent tomber coup sur coup.
    const { result } = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend(COUPLE));
    act(() => settleSpend());
    act(() => settleSpend());
    expect(result.current).toBeNull();
  });

  it('republie un couple ENTIER après un solde, jamais un reliquat', () => {
    // Ce cas s'appelait « solde les DEUX figures, jamais une seule » et
    // s'appuyait sur `expect(result.current?.depensesDuMois).toBeUndefined()`
    // après avoir vérifié `toBeNull()`. **Cette seconde ligne ne pouvait pas
    // échouer** : `null?.x` vaut `undefined` par court-circuit, quel que soit
    // l'état antérieur. Elle promettait une propriété qu'elle ne tenait pas.
    //
    // L'état « purgé à moitié » est de toute façon inexprimable : le magasin
    // porte UN objet nullable, pas deux champs indépendants. C'est le TYPE qui
    // le garantit, pas un test — et le prétendre testé aurait été faux.
    //
    // Ce qu'on peut réellement exercer, et qui vaut la peine : après un solde,
    // une nouvelle annonce revient avec ses deux membres, pas avec le reliquat
    // de la précédente.
    const { result } = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend(COUPLE));
    act(() => settleSpend());
    act(() => announceOptimisticSpend({ ilTeReste: 12, depensesDuMois: 34 }));
    expect(result.current).toEqual({ ilTeReste: 12, depensesDuMois: 34 });
  });
});

describe('optimistic-spend — ce qu’il refuse', () => {
  it.each([[NaN], [Infinity], [-Infinity]])(
    'ignore un « Il te reste » à %p plutôt que de l’afficher',
    (invalide) => {
      // Un champ à moitié saisi produit un NaN. Sans ce garde, le hero
      // afficherait « NaN € » — une panne visible, sur le chiffre le plus lu
      // de l'application.
      const { result } = renderHook(() => useOptimisticSpend());
      act(() => announceOptimisticSpend({ ilTeReste: invalide, depensesDuMois: 10 }));
      expect(result.current).toBeNull();
    },
  );

  it.each([[NaN], [Infinity], [-Infinity]])(
    'ignore un « Dépensé ce mois » à %p plutôt que de le tracer',
    (invalide) => {
      // Le garde porte sur les DEUX membres. N'en vérifier qu'un laisserait
      // passer un couple à moitié valide, et la courbe perdrait son tracé
      // entier — un `d` contenant NaN n'est pas dessiné du tout — pendant que
      // le hero, lui, bougerait normalement.
      const { result } = renderHook(() => useOptimisticSpend());
      act(() => announceOptimisticSpend({ ilTeReste: 100, depensesDuMois: invalide }));
      expect(result.current).toBeNull();
    },
  );

  it('ne détruit pas un couple valide quand un invalide arrive après', () => {
    const { result } = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend(COUPLE));
    act(() => announceOptimisticSpend({ ilTeReste: NaN, depensesDuMois: NaN }));
    expect(result.current).toEqual(COUPLE);
  });

  it('accepte zéro et les valeurs négatives', () => {
    // « Il te reste » a le droit d'être nul ou négatif : c'est un fait, pas une
    // valeur invalide. Confondre « non fini » et « non positif » masquerait
    // exactement le mois qu'il est le plus utile de voir. Et « Dépensé ce
    // mois » peut être négatif après un remboursement.
    const { result } = renderHook(() => useOptimisticSpend());
    act(() => announceOptimisticSpend({ ilTeReste: 0, depensesDuMois: 0 }));
    expect(result.current).toEqual({ ilTeReste: 0, depensesDuMois: 0 });
    act(() => announceOptimisticSpend({ ilTeReste: -42.5, depensesDuMois: -8 }));
    expect(result.current).toEqual({ ilTeReste: -42.5, depensesDuMois: -8 });
  });
});
