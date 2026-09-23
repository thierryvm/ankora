import { describe, expect, it } from 'vitest';

import {
  MAX_SUGGESTIONS,
  breakdownByCategory,
  descriptionHistory,
  foldDescription,
  groupByDescription,
  recallCategory,
  suggestDescriptions,
  type DescriptionEntry,
} from '../descriptions';
import { ENSEIGNES } from '../enseignes';

const COURSES = { id: 'c-courses', name: 'Courses' };
const CARBURANT = { id: 'c-carburant', name: 'Carburant' };
const LOISIRS = { id: 'c-loisirs', name: 'Loisirs' };
const CATS = [COURSES, CARBURANT, LOISIRS];

const row = (label: string, occurredOn: string, categoryId: string | null) => ({
  label,
  occurredOn,
  categoryId,
});

describe('foldDescription', () => {
  it('ignores case, accents and punctuation', () => {
    expect(foldDescription('  Intermarché ')).toBe('intermarche');
    expect(foldDescription('Bio-Planet')).toBe('bio planet');
    expect(foldDescription('KRËFEL')).toBe('krefel');
  });
});

describe('descriptionHistory', () => {
  it('counts each description once, by frequency then most recent', () => {
    const history = descriptionHistory(
      [
        row('Colruyt', '2026-09-01', COURSES.id),
        row('colruyt', '2026-09-10', COURSES.id),
        row('Aral', '2026-09-20', CARBURANT.id),
        row('Cinéma', '2026-09-05', LOISIRS.id),
      ],
      CATS,
    );
    expect(history.map((h) => h.label)).toEqual(['colruyt', 'Aral', 'Cinéma']);
    expect(history[0]).toMatchObject({ count: 2, lastOn: '2026-09-10' });
  });

  it('keeps the category of the MOST RECENT use of a description', () => {
    const history = descriptionHistory(
      [row('Aral', '2026-09-20', CARBURANT.id), row('Aral', '2026-08-01', LOISIRS.id)],
      CATS,
    );
    expect(history[0]?.lastCategoryId).toBe(CARBURANT.id);
  });

  it('never offers a label that says nothing: empty, or equal to its category name', () => {
    // The sheet used to store the category name when the label was left empty:
    // « Courses » under Courses is not a place, it is the fallback.
    const history = descriptionHistory(
      [row('Courses', '2026-09-01', COURSES.id), row('  ', '2026-09-02', COURSES.id)],
      CATS,
    );
    expect(history).toEqual([]);
  });

  it('keeps a label equal to the name of ANOTHER category', () => {
    const history = descriptionHistory([row('Courses', '2026-09-01', LOISIRS.id)], CATS);
    expect(history.map((h) => h.label)).toEqual(['Courses']);
  });
});

describe('suggestDescriptions — rule 26', () => {
  const history: DescriptionEntry[] = [
    { label: 'Chez Mario', count: 3, lastOn: '2026-09-18', lastCategoryId: LOISIRS.id },
    { label: 'Colruyt Jambes', count: 1, lastOn: '2026-09-02', lastCategoryId: COURSES.id },
  ];

  it('offers nothing before the first letter', () => {
    expect(suggestDescriptions('  ', history, CATS)).toEqual([]);
  });

  it("puts the person's own descriptions BEFORE any built-in chain", () => {
    const s = suggestDescriptions('c', history, CATS);
    expect(s.slice(0, 2).map((x) => x.label)).toEqual(['Chez Mario', 'Colruyt Jambes']);
    expect(s.slice(0, 2).every((x) => x.source === 'mine')).toBe(true);
    expect(s.slice(2).every((x) => x.source === 'chain')).toBe(true);
    expect(s.map((x) => x.label)).toContain('Colruyt');
  });

  it('caps the list at six', () => {
    expect(suggestDescriptions('c', history, CATS).length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    expect(MAX_SUGGESTIONS).toBe(6);
  });

  it('matches the start of any word, without accents', () => {
    expect(suggestDescriptions('intermar', [], CATS).map((x) => x.label)).toEqual(['Intermarché']);
    expect(suggestDescriptions('mario', history, CATS).map((x) => x.label)).toEqual(['Chez Mario']);
    // Not in the middle of a word.
    expect(suggestDescriptions('ruyt', [], CATS)).toEqual([]);
  });

  it('lists chains whose NAME starts with the letters first', () => {
    // « d » : Delhaize before AD Delhaize.
    const labels = suggestDescriptions('delh', [], CATS).map((x) => x.label);
    expect(labels.indexOf('Delhaize')).toBeLessThan(labels.indexOf('AD Delhaize'));
  });

  it('never repeats a chain the person already typed', () => {
    const mine: DescriptionEntry[] = [
      { label: 'colruyt', count: 1, lastOn: '2026-09-01', lastCategoryId: COURSES.id },
    ];
    const labels = suggestDescriptions('col', mine, CATS).map((x) => x.label);
    expect(labels.filter((l) => foldDescription(l) === 'colruyt')).toHaveLength(1);
  });

  it('proposes the category of a chain from its family, when the person has one', () => {
    const s = suggestDescriptions('shell', [], CATS);
    expect(s[0]).toMatchObject({ label: 'Shell', categoryId: CARBURANT.id });
    // No matching category in the workspace: no pre-selection.
    expect(suggestDescriptions('ikea', [], CATS)[0]).toMatchObject({ categoryId: null });
  });

  it('drops a remembered category that is no longer selectable', () => {
    const gone: DescriptionEntry[] = [
      { label: 'Chez Mario', count: 1, lastOn: '2026-09-01', lastCategoryId: 'c-deleted' },
    ];
    expect(suggestDescriptions('che', gone, CATS)[0]?.categoryId).toBeNull();
  });
});

describe('recallCategory — F-20', () => {
  const history: DescriptionEntry[] = [
    { label: 'Aral', count: 2, lastOn: '2026-09-20', lastCategoryId: CARBURANT.id },
  ];

  it('recalls the category of the last expense under the same description', () => {
    expect(recallCategory('  aral ', history, CATS)).toBe(CARBURANT.id);
  });

  it('falls back to the chain family for a first use of a known chain', () => {
    expect(recallCategory('Colruyt', history, CATS)).toBe(COURSES.id);
  });

  it('recalls nothing for an unknown description', () => {
    expect(recallCategory('Boulangerie du coin', history, CATS)).toBeNull();
    expect(recallCategory('', history, CATS)).toBeNull();
  });
});

describe('ENSEIGNES — F-34', () => {
  it('spells the chains exactly, Belgium plus the German border chains', () => {
    const names = ENSEIGNES.map(([n]) => n);
    for (const n of ['Colruyt', 'Delhaize', 'Intermarché', 'Krëfel', 'OKay', 'DATS 24']) {
      expect(names).toContain(n);
    }
    for (const n of ['Kaufland', 'Rewe', 'Edeka', 'dm', 'Rossmann']) expect(names).toContain(n);
  });

  it('holds no duplicate once folded', () => {
    const folded = ENSEIGNES.map(([n]) => foldDescription(n));
    expect(new Set(folded).size).toBe(folded.length);
  });
});

describe('groupByDescription — the detail of a category', () => {
  it('groups by description, largest subtotal first, « Sans libellé » last', () => {
    const groups = groupByDescription(
      [
        { id: '1', label: 'Colruyt', amount: 20, occurredOn: '2026-09-01' },
        { id: '2', label: 'colruyt', amount: 15.5, occurredOn: '2026-09-03' },
        { id: '3', label: 'Lidl', amount: 50, occurredOn: '2026-09-02' },
        { id: '4', label: 'Courses', amount: 99, occurredOn: '2026-09-04' },
      ],
      'Courses',
    );
    expect(groups.map((g) => g.label)).toEqual(['Lidl', 'Colruyt', null]);
    expect(groups[1]).toMatchObject({ total: 35.5 });
    expect(groups[1]?.lines.map((l) => l.id)).toEqual(['2', '1']);
    // The subtotals add up to the category total, to the cent.
    expect(groups.reduce((s, g) => s + g.total, 0)).toBe(184.5);
  });
});

describe('breakdownByCategory — the month total, opened', () => {
  it('orders categories by total, « Sans catégorie » last, and adds up to the cent', () => {
    const b = breakdownByCategory(
      [
        { id: '1', label: 'Colruyt', amount: 20.1, occurredOn: '2026-09-01', categoryId: 'c1' },
        { id: '2', label: 'Shell', amount: 60.2, occurredOn: '2026-09-02', categoryId: 'c2' },
        { id: '3', label: 'Divers', amount: 5, occurredOn: '2026-09-03', categoryId: null },
        { id: '4', label: 'Lidl', amount: 0.7, occurredOn: '2026-09-04', categoryId: 'c1' },
      ],
      [
        { id: 'c1', name: 'Courses', colorToken: 'emerald' },
        { id: 'c2', name: 'Carburant', colorToken: 'cyan' },
      ],
    );
    expect(b.map((x) => x.name)).toEqual(['Carburant', 'Courses', null]);
    expect(b[1]).toMatchObject({ total: 20.8 });
    expect(b[1]?.groups.map((g) => g.label)).toEqual(['Colruyt', 'Lidl']);
    const cents = b.reduce((s, x) => s + Math.round(x.total * 100), 0);
    expect(cents).toBe(8600);
  });
});
