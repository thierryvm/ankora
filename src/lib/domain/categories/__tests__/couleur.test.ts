import { describe, expect, it } from 'vitest';

import { couleurLaMoinsUtilisee } from '../couleur';
import { CATEGORY_COLOR_TOKENS, type Category, type CategoryColorToken } from '../types';

const cat = (id: string, colorToken: CategoryColorToken): Category => ({
  id,
  name: id,
  kind: 'variable',
  colorToken,
  isSystem: false,
});

/** Les 18 jetons réellement semés : 8 le 2026-05-03, 10 le 2026-07-29. */
const SEMIS_REEL: readonly CategoryColorToken[] = [
  // 20260503000003 — un jeton chacun, les 8 y passent
  'blue',
  'pink',
  'rose',
  'emerald',
  'purple',
  'amber',
  'cyan',
  'zinc',
  // 20260729000002 — 10 catégories, aucun jeton neuf
  'emerald',
  'amber',
  'cyan',
  'pink',
  'purple',
  'rose',
  'blue',
  'zinc',
  'amber',
  'pink',
];

describe('couleurLaMoinsUtilisee', () => {
  it('rend le premier jeton déclaré sur un espace vide', () => {
    expect(couleurLaMoinsUtilisee([])).toBe(CATEGORY_COLOR_TOKENS[0]);
  });

  it('choisit le jeton le moins porté', () => {
    const categories = [cat('a', 'blue'), cat('b', 'blue'), cat('c', 'pink')];
    // `rose` est à 0, comme les cinq suivants ; il gagne par l'ordre de
    // déclaration (blue et pink sont pris).
    expect(couleurLaMoinsUtilisee(categories)).toBe('rose');
  });

  it('départage une égalité par l’ordre de déclaration, jamais au hasard', () => {
    const categories = [cat('a', 'blue')];
    // pink, rose, emerald… sont tous à 0. Le premier déclaré parmi eux gagne.
    expect(couleurLaMoinsUtilisee(categories)).toBe('pink');
    // Et deux appels identiques rendent la même chose — c'est la promesse.
    expect(couleurLaMoinsUtilisee(categories)).toBe(couleurLaMoinsUtilisee(categories));
  });

  it('rend TOUJOURS blue sur le semis réel — la règle ne promet pas de la variété', () => {
    // Après les 18 semées : pink et amber à 3, les six autres à 2. L'égalité à
    // six est départagée par l'ordre du tableau, donc la PREMIÈRE catégorie
    // créée est bleue, pour tout le monde. Assertion écrite contre ce que la
    // règle fait, pas contre ce qu'on aimerait qu'elle fasse.
    const semis = SEMIS_REEL.map((jeton, i) => cat(`s${i}`, jeton));
    expect(couleurLaMoinsUtilisee(semis)).toBe('blue');
  });

  it('s’écarte du plus chargé dès la deuxième création', () => {
    const semis = SEMIS_REEL.map((jeton, i) => cat(`s${i}`, jeton));
    const apresUne = [...semis, cat('nouvelle', 'blue')];
    expect(couleurLaMoinsUtilisee(apresUne)).toBe('rose');
  });

  it('rend toujours un jeton de la liste fermée', () => {
    const categories = CATEGORY_COLOR_TOKENS.map((jeton, i) => cat(`c${i}`, jeton));
    expect(CATEGORY_COLOR_TOKENS).toContain(couleurLaMoinsUtilisee(categories));
  });
});
