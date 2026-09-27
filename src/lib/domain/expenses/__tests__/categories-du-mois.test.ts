import { describe, expect, it } from 'vitest';

import { totalAmount } from '@/lib/domain/expenses/helpers';
import { money, type Expense } from '@/lib/domain/types';

import { categoriesDuMois } from '../categories-du-mois';

// Fictitious household (public repo), September 2026.
const dep = (id: string, categoryId: string | null, amount: string, day: number): Expense =>
  ({
    id,
    label: `Dépense ${id}`,
    amount: money(amount),
    occurredOn: `2026-09-${String(day).padStart(2, '0')}`,
    categoryId,
    note: null,
    paidFrom: 'vie_courante',
  }) as unknown as Expense;

const EXPENSES = [
  dep('a', 'c-courses', '50.55', 2),
  dep('b', 'c-courses', '12.10', 9),
  dep('c', null, '7.35', 4),
  dep('d', 'c-loisirs', '75.00', 6),
  dep('e', 'c-inconnue', '3.03', 7),
];
const CATEGORIES = [
  { id: 'c-courses', name: 'Courses', colorToken: 'amber' as const },
  { id: 'c-loisirs', name: 'Loisirs', colorToken: 'blue' as const },
];

describe('categoriesDuMois', () => {
  it('groups every expense into exactly one group, whose subtotals add up to the total, to the cent', () => {
    const groupes = categoriesDuMois(EXPENSES, CATEGORIES);
    const somme = groupes.reduce((s, g) => s.plus(g.total), money(0));
    expect(somme.equals(totalAmount(EXPENSES))).toBe(true);
    expect(groupes.flatMap((g) => g.lignes.map((l) => l.id)).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('orders the groups from the largest to the smallest', () => {
    expect(categoriesDuMois(EXPENSES, CATEGORIES).map((g) => g.total.toFixed(2))).toEqual([
      '75.00',
      '62.65',
      '7.35',
      '3.03',
    ]);
  });

  it('keeps the expenses without a category as a named group, never lost', () => {
    const sans = categoriesDuMois(EXPENSES, CATEGORIES).find((g) => g.id === null);
    expect(sans).toMatchObject({ nom: null, couleur: null });
    expect(sans?.lignes.map((l) => l.id)).toEqual(['c']);
  });

  it('names a group from the workspace categories, with its colour', () => {
    const courses = categoriesDuMois(EXPENSES, CATEGORIES).find((g) => g.id === 'c-courses');
    expect(courses).toMatchObject({ nom: 'Courses', couleur: 'amber' });
  });

  it('an empty month has no group', () => {
    expect(categoriesDuMois([], CATEGORIES)).toEqual([]);
  });
});
