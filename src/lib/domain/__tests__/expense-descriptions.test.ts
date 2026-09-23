import { describe, expect, it } from 'vitest';

import {
  BRAND_FAMILY_CATEGORIES,
  BRANDS,
  fold,
  ownDescriptionsFrom,
  recallCategory,
  suggestDescriptions,
  type OwnDescription,
} from '../expense-descriptions';

/**
 * v3 mock-up, rule 26 — « the description says WHERE, the category says WHAT ».
 *
 * The description field suggests, from the first letter, what the person has
 * already written, then a built-in list of Belgian brands. Choosing a
 * suggestion fills the field and ticks the category it implies. Everything
 * here is pure: the sheet only renders what these functions return.
 */

const COURSES = { id: 'c-courses', name: 'Courses' };
const CARBURANT = { id: 'c-carburant', name: 'Carburant' };
const RESTO = { id: 'c-resto', name: 'Restaurant & café' };
const CATEGORIES = [COURSES, CARBURANT, RESTO];

function own(
  label: string,
  count: number,
  lastOn: string,
  categoryId: string | null = null,
): OwnDescription {
  return { label, count, lastOn, categoryId };
}

describe('fold — no case, no accents, words only', () => {
  it.each([
    ['Intermarché', 'intermarche'],
    ['  KRËFEL ', 'krefel'],
    ['Électroménager', 'electromenager'],
    ['DATS 24', 'dats 24'],
    ['Bio-Planet', 'bio planet'],
    ["Resto d'Alain", 'resto d alain'],
    ['', ''],
    ['!!!', ''],
  ])('folds %j to %j', (input, expected) => {
    expect(fold(input)).toBe(expected);
  });

  it('treats null and undefined as empty', () => {
    expect(fold(null)).toBe('');
    expect(fold(undefined)).toBe('');
  });
});

describe('the built-in brand list', () => {
  it('keeps the exact spelling of the brands', () => {
    const names = BRANDS.map(([name]) => name);
    for (const name of ['Intermarché', 'Krëfel', 'OKay', 'Bio-Planet', 'DATS 24', 'IKEA', 'dm']) {
      expect(names).toContain(name);
    }
  });

  it('gives every brand a family that has category names', () => {
    for (const [, family] of BRANDS) {
      expect(BRAND_FAMILY_CATEGORIES[family].length).toBeGreaterThan(0);
    }
  });
});

describe('suggestDescriptions', () => {
  it('suggests nothing for an empty or blank query', () => {
    expect(suggestDescriptions('', [], CATEGORIES)).toEqual([]);
    expect(suggestDescriptions('   ', [], CATEGORIES)).toEqual([]);
    expect(suggestDescriptions('!!', [own('Chez Paul', 3, '2026-09-01')], CATEGORIES)).toEqual([]);
  });

  it('« intermar » → Intermarché, which ticks « Courses »', () => {
    const [first] = suggestDescriptions('intermar', [], CATEGORIES);
    expect(first).toEqual({ label: 'Intermarché', categoryId: COURSES.id, count: 0 });
  });

  it('matches without case or accents, on the start of ANY word', () => {
    expect(suggestDescriptions('INTERMARCHE', [], CATEGORIES)[0]?.label).toBe('Intermarché');
    expect(suggestDescriptions('kref', [], CATEGORIES)[0]?.label).toBe('Krëfel');
    const mine = [own('Café Léon', 2, '2026-09-01', RESTO.id)];
    expect(suggestDescriptions('LEON', mine, CATEGORIES)[0]?.label).toBe('Café Léon');
    expect(suggestDescriptions('cafe l', mine, CATEGORIES)[0]?.label).toBe('Café Léon');
    // Inside a word is not the start of a word.
    expect(suggestDescriptions('eon', mine, CATEGORIES)).toEqual([]);
  });

  it('puts the person’s own descriptions BEFORE the brands', () => {
    const mine = [own('Delhaize Boondael', 1, '2026-09-01', COURSES.id)];
    const labels = suggestDescriptions('del', mine, CATEGORIES).map((s) => s.label);
    expect(labels[0]).toBe('Delhaize Boondael');
    expect(labels.slice(1)).toEqual(['Delhaize', 'AD Delhaize', 'Proxy Delhaize']);
  });

  it('orders own descriptions by count, then by most recent use', () => {
    const mine = [
      own('Colruyt Ixelles', 1, '2026-09-20'),
      own('Colruyt Etterbeek', 4, '2026-08-01'),
      own('Colruyt Uccle', 1, '2026-09-22'),
    ];
    const labels = suggestDescriptions('colr', mine, CATEGORIES).map((s) => s.label);
    expect(labels).toEqual(['Colruyt Etterbeek', 'Colruyt Uccle', 'Colruyt Ixelles', 'Colruyt']);
  });

  it('carries the count of an own description, 0 for a brand', () => {
    const mine = [own('Colruyt', 3, '2026-09-20', COURSES.id)];
    expect(suggestDescriptions('colr', mine, CATEGORIES)).toEqual([
      { label: 'Colruyt', categoryId: COURSES.id, count: 3 },
    ]);
  });

  it('never suggests a brand already among the person’s own (folded)', () => {
    const mine = [own('COLRUYT', 2, '2026-09-20', COURSES.id)];
    const labels = suggestDescriptions('col', mine, CATEGORIES).map((s) => s.label);
    expect(labels.filter((l) => fold(l) === 'colruyt')).toEqual(['COLRUYT']);
  });

  it('« d » → Delhaize before AD Delhaize: a NAME that starts with the query comes first', () => {
    // Names starting with « d », in list order, then names with a later word
    // starting with it — cut at six, so « Proxy Delhaize » does not make it.
    expect(suggestDescriptions('d', [], CATEGORIES).map((s) => s.label)).toEqual([
      'Delhaize',
      'Di',
      'Decathlon',
      'dm',
      'DATS 24',
      'AD Delhaize',
    ]);
  });

  it('returns six suggestions at most', () => {
    const mine = [
      own('Cinéma', 5, '2026-09-01'),
      own('Coiffeur', 4, '2026-09-01'),
      own('Cadeau Léa', 3, '2026-09-01'),
    ];
    const suggestions = suggestDescriptions('c', mine, CATEGORIES);
    expect(suggestions).toHaveLength(6);
    expect(suggestions.slice(0, 3).map((s) => s.label)).toEqual([
      'Cinéma',
      'Coiffeur',
      'Cadeau Léa',
    ]);
  });

  it('keeps the category of an own description when it still exists', () => {
    const mine = [own('Colruyt', 2, '2026-09-20', RESTO.id)];
    // The person filed it under Restaurant: that choice wins over the brand’s family.
    expect(suggestDescriptions('colr', mine, CATEGORIES)[0]?.categoryId).toBe(RESTO.id);
  });

  it('falls back to the brand’s category when the own category no longer exists', () => {
    const mine = [own('Colruyt', 2, '2026-09-20', 'c-deleted')];
    expect(suggestDescriptions('colr', mine, CATEGORIES)[0]?.categoryId).toBe(COURSES.id);
  });

  it('proposes no category when the own one is gone and the label is no brand', () => {
    const mine = [own('Chez Paul', 2, '2026-09-20', 'c-deleted')];
    expect(suggestDescriptions('chez', mine, CATEGORIES)[0]?.categoryId).toBeNull();
  });

  it('proposes no category for an own description never categorised', () => {
    const mine = [own('Chez Paul', 2, '2026-09-20', null)];
    expect(suggestDescriptions('chez', mine, CATEGORIES)[0]?.categoryId).toBeNull();
  });

  it('picks the FIRST category of the family that the person actually has', () => {
    // carburant → ['Carburant', 'Essence']: without « Carburant », « Essence ».
    const essence = { id: 'c-essence', name: 'ESSENCE' };
    expect(suggestDescriptions('shell', [], [essence])[0]?.categoryId).toBe(essence.id);
    expect(suggestDescriptions('shell', [], [essence, CARBURANT])[0]?.categoryId).toBe(
      CARBURANT.id,
    );
  });

  it('proposes no category for a brand whose family the person has none of', () => {
    expect(suggestDescriptions('shell', [], [COURSES])[0]).toEqual({
      label: 'Shell',
      categoryId: null,
      count: 0,
    });
  });

  it('matches a category name without accents or case (« Électroménager »)', () => {
    const electro = { id: 'c-electro', name: 'electromenager' };
    expect(suggestDescriptions('media', [], [electro])[0]).toEqual({
      label: 'MediaMarkt',
      categoryId: electro.id,
      count: 0,
    });
  });
});

describe('recallCategory — a description typed in full, without picking a suggestion', () => {
  const mine = [
    own('Colruyt', 3, '2026-09-20', COURSES.id),
    own('Boulangerie Pierre', 1, '2026-09-10', 'c-deleted'),
    own('Chez Paul', 1, '2026-09-10', 'c-deleted'),
  ];

  it('recalls the category of the matching own description, folded exactly', () => {
    expect(recallCategory('colruyt', mine, CATEGORIES)).toBe(COURSES.id);
    expect(recallCategory('  COLRUYT ', mine, CATEGORIES)).toBe(COURSES.id);
  });

  it('recalls nothing on a partial match', () => {
    expect(recallCategory('colr', mine, CATEGORIES)).toBeNull();
  });

  it('recalls nothing for an empty description', () => {
    expect(recallCategory('', mine, CATEGORIES)).toBeNull();
  });

  it('recalls nothing for a description that is not one of the person’s own', () => {
    // A brand typed in full is not a memory: only a choice of suggestion ticks it.
    expect(recallCategory('Delhaize', mine, CATEGORIES)).toBeNull();
  });

  it('recalls nothing when the remembered category is gone and the label is no brand', () => {
    expect(recallCategory('chez paul', mine, CATEGORIES)).toBeNull();
  });

  it('falls back to the brand’s category when the remembered one is gone', () => {
    const gone = [own('Colruyt', 1, '2026-09-10', 'c-deleted')];
    expect(recallCategory('Colruyt', gone, CATEGORIES)).toBe(COURSES.id);
  });
});

describe('ownDescriptionsFrom — built from the person’s expenses', () => {
  const EXCLUDED = { categoryNames: ['Courses', 'Restaurant & café'], fallbackLabels: ['Dépense'] };

  function row(label: string, occurredOn: string, categoryId: string | null, createdAt = 'T0') {
    return { label, occurredOn, categoryId, createdAt };
  }

  it('counts per folded description, keeping the most recent label and category', () => {
    const rows = [
      row('Colruyt Ixelles', '2026-09-20', COURSES.id, '2026-09-20T10:00:00Z'),
      row('colruyt ixelles', '2026-09-12', RESTO.id, '2026-09-12T10:00:00Z'),
      row('COLRUYT IXELLES', '2026-09-01', null, '2026-09-01T10:00:00Z'),
    ];
    expect(ownDescriptionsFrom(rows, EXCLUDED)).toEqual([
      { label: 'Colruyt Ixelles', categoryId: COURSES.id, count: 3, lastOn: '2026-09-20' },
    ]);
  });

  it('does not depend on the order of the rows', () => {
    const rows = [
      row('colruyt', '2026-09-01', null, '2026-09-01T10:00:00Z'),
      row('Colruyt', '2026-09-20', COURSES.id, '2026-09-20T10:00:00Z'),
    ];
    expect(ownDescriptionsFrom(rows, EXCLUDED)).toEqual([
      { label: 'Colruyt', categoryId: COURSES.id, count: 2, lastOn: '2026-09-20' },
    ]);
  });

  it('on the same day, the one entered last wins', () => {
    const rows = [
      row('Boulangerie', '2026-09-20', RESTO.id, '2026-09-20T08:00:00Z'),
      row('BOULANGERIE', '2026-09-20', COURSES.id, '2026-09-20T18:00:00Z'),
    ];
    expect(ownDescriptionsFrom(rows, EXCLUDED)[0]).toMatchObject({
      label: 'BOULANGERIE',
      categoryId: COURSES.id,
    });
  });

  it('leaves out a description that says nothing about a place', () => {
    const rows = [
      row('   ', '2026-09-20', null),
      row('!!', '2026-09-20', null),
      // The sheet writes the category name in place of an empty description…
      row('courses', '2026-09-20', COURSES.id),
      row('Restaurant & Café', '2026-09-20', RESTO.id),
      // …or the default word when there is no category at all.
      row('Dépense', '2026-09-20', null),
      row('depense', '2026-09-20', null),
      row('Colruyt', '2026-09-20', COURSES.id),
    ];
    expect(ownDescriptionsFrom(rows, EXCLUDED).map((d) => d.label)).toEqual(['Colruyt']);
  });

  it('sorts by count, then by most recent use', () => {
    const rows = [
      row('Pharmacie', '2026-09-22', null),
      row('Colruyt', '2026-09-01', COURSES.id),
      row('Colruyt', '2026-09-02', COURSES.id),
      row('Boulangerie', '2026-09-10', null),
    ];
    expect(ownDescriptionsFrom(rows, EXCLUDED).map((d) => d.label)).toEqual([
      'Colruyt',
      'Pharmacie',
      'Boulangerie',
    ]);
  });

  it('returns nothing for no rows', () => {
    expect(ownDescriptionsFrom([], EXCLUDED)).toEqual([]);
  });
});
