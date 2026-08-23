import { describe, expect, it } from 'vitest';

import { categorieHomonyme, cleNomCategorie } from '../nom-disponible';
import type { Category, CategoryColorToken, CategoryKind } from '../types';

const cat = (
  name: string,
  kind: CategoryKind = 'variable',
  colorToken: CategoryColorToken = 'blue',
): Category => ({
  id: `id-${name}`,
  name,
  kind,
  colorToken,
  isSystem: false,
});

describe('cleNomCategorie', () => {
  it('ignore la casse', () => {
    expect(cleNomCategorie('Courses')).toBe(cleNomCategorie('COURSES'));
    expect(cleNomCategorie('Courses')).toBe(cleNomCategorie('courses'));
  });

  it('ignore les espaces de bordure', () => {
    expect(cleNomCategorie('  Courses  ')).toBe(cleNomCategorie('Courses'));
  });

  it('réduit les espaces intérieurs', () => {
    // « Restaurant  café » avec deux espaces est le même nom. `trim()` seul ne
    // le voit pas, et deux puces identiques à l'œil seraient créées.
    expect(cleNomCategorie('Restaurant  café')).toBe(cleNomCategorie('Restaurant café'));
    expect(cleNomCategorie('Restaurant café')).toBe(cleNomCategorie('Restaurant café'));
  });

  it('rend équivalentes les deux écritures Unicode d’un accent', () => {
    // NFD : « e » suivi de l'accent combinant. NFC : le caractère précomposé.
    // Rendus à l'identique, et `===` les sépare sans normalisation.
    const nfd = 'Santé';
    const nfc = 'Santé';
    expect(nfd).not.toBe(nfc);
    expect(cleNomCategorie(nfd)).toBe(cleNomCategorie(nfc));
  });

  it('retire les caractères invisibles', () => {
    // Le contournement à un caractère : U+200B ne se voit pas et `trim()` ne le
    // retire pas.
    expect(cleNomCategorie('Courses​')).toBe(cleNomCategorie('Courses'));
    expect(cleNomCategorie('Cour­ses')).toBe(cleNomCategorie('Courses'));
    expect(cleNomCategorie('Courses﻿')).toBe(cleNomCategorie('Courses'));
  });

  it('ne dépouille PAS les accents', () => {
    // Décision explicite d'ADR-043 D2 : confondre « Santé » et « Sante »
    // demanderait de deviner l'intention.
    expect(cleNomCategorie('Santé')).not.toBe(cleNomCategorie('Sante'));
  });
});

describe('categorieHomonyme', () => {
  const existantes = [
    cat('Courses'),
    cat('Restaurant & café'),
    cat('Assurances', 'fixed'),
    cat('Réduction 50%'),
  ];

  it('trouve l’homonyme quelle que soit la casse', () => {
    expect(categorieHomonyme('courses', existantes)?.name).toBe('Courses');
    expect(categorieHomonyme('  COURSES ', existantes)?.name).toBe('Courses');
  });

  it('rend null quand le nom est libre', () => {
    expect(categorieHomonyme('Coiffeur', existantes)).toBeNull();
  });

  it('rend la catégorie et non un booléen, pour que le message dépende du kind', () => {
    // Sans le `kind`, l'utilisateur lirait « existe déjà » à propos d'une
    // catégorie que le sélecteur de dépense ne lui montre jamais (ADR-035 §5),
    // et l'application aurait l'air cassée.
    const trouve = categorieHomonyme('assurances', existantes);
    expect(trouve?.kind).toBe('fixed');
  });

  it('traite % et _ comme des CARACTÈRES, jamais comme des jokers', () => {
    // C'est la raison d'être de ce module. En SQL `ilike`, « % » matcherait
    // tout : la catégorie serait déclarée doublon pour toujours et deviendrait
    // impossible à créer.
    expect(categorieHomonyme('%', existantes)).toBeNull();
    expect(categorieHomonyme('_ourses', existantes)).toBeNull();
    expect(categorieHomonyme('Réduction 50%', existantes)?.name).toBe('Réduction 50%');
  });

  it('rend null sur un nom vide plutôt que de matcher une ligne vide', () => {
    expect(categorieHomonyme('', existantes)).toBeNull();
    expect(categorieHomonyme('   ', existantes)).toBeNull();
  });

  it('ne trouve rien dans un espace sans catégorie', () => {
    expect(categorieHomonyme('Courses', [])).toBeNull();
  });
});
