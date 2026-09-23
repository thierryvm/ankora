import { describe, expect, it } from 'vitest';

import { money, type Expense } from '@/lib/domain/types';

import {
  CHIP_COUNT,
  expenseCategoryChips,
  isSelectableForExpense,
  rankExpenseCategories,
  selectableExpenseCategories,
} from '../expense-categories';
import type { Category, CategoryKind } from '../types';

const TODAY = '2026-07-29';

let seq = 0;
function cat(name: string, kind: CategoryKind = 'variable'): Category {
  seq += 1;
  return {
    id: `cat-${String(seq).padStart(2, '0')}-${name.toLowerCase()}`,
    name,
    kind,
    colorToken: 'zinc',
    isSystem: false,
  };
}

function spend(categoryId: string | null, occurredOn: string, amount = 10): Expense {
  return {
    id: `exp-${categoryId ?? 'none'}-${occurredOn}-${amount}`,
    label: 'x',
    amount: money(amount),
    occurredOn,
    categoryId,
    note: null,
    paidFrom: 'vie_courante',
  };
}

describe('the expense picker cannot offer a bill category (ADR-035 §5 corollary)', () => {
  /**
   * The invariant is « a charge occurrence is never an expense ». The domain
   * enforces it, but an interface that INVITES the violation is the actual
   * risk: file 150 € of car insurance under « Assurances » and it is deducted
   * twice — once as smoothed effort inside `resteDisponible`, once as a raw
   * expense — so « Il te reste » is wrong by exactly the amount of a bill the
   * user believed they were being diligent about. Making the mistake
   * unreachable beats detecting it.
   */
  const all = [
    cat('Courses'),
    cat('Assurances', 'fixed'),
    cat('Taxes', 'fixed'),
    cat('Salaire', 'income'),
    cat('Carburant'),
  ];

  it('offers only variable categories', () => {
    expect(selectableExpenseCategories(all).map((c) => c.name)).toEqual(['Courses', 'Carburant']);
  });

  it.each(['fixed', 'income'] as const)('refuses a %s category one by one', (kind) => {
    expect(isSelectableForExpense(cat('X', kind))).toBe(false);
  });

  it('accepts a variable category', () => {
    expect(isSelectableForExpense(cat('Courses'))).toBe(true);
  });

  it('never lets a bill category reach the chip row, however often it was used', () => {
    const insurance = all[1]!;
    // Fabricate a history where the bill category is by far the most used —
    // a ranking that only sorted by frequency would put it first.
    const history = Array.from({ length: 20 }, (_, i) =>
      spend(insurance.id, `2026-07-${String((i % 28) + 1).padStart(2, '0')}`),
    );

    const { chips, overflow, preselectedId } = expenseCategoryChips(all, history, TODAY);

    expect([...chips, ...overflow].map((c) => c.id)).not.toContain(insurance.id);
    expect(preselectedId).not.toBe(insurance.id);
  });
});

describe('rankExpenseCategories — most used over the 30-day window', () => {
  const courses = cat('Courses');
  const carburant = cat('Carburant');
  const resto = cat('Restaurant');
  const all = [courses, carburant, resto];

  it('puts the most used first', () => {
    const history = [
      spend(resto.id, '2026-07-20'),
      spend(courses.id, '2026-07-21'),
      spend(courses.id, '2026-07-22'),
      spend(courses.id, '2026-07-23'),
      spend(carburant.id, '2026-07-24'),
      spend(carburant.id, '2026-07-25'),
    ];

    expect(rankExpenseCategories(all, history, TODAY).map((c) => c.name)).toEqual([
      'Courses',
      'Carburant',
      'Restaurant',
    ]);
  });

  it('ignores use older than the window', () => {
    // 40 days back: outside the 30-day window, so it must not win the ranking.
    const history = [
      ...Array.from({ length: 10 }, (_, i) => spend(resto.id, `2026-06-1${i % 10}`)),
      spend(courses.id, '2026-07-28'),
    ];

    expect(rankExpenseCategories(all, history, TODAY)[0]?.name).toBe('Courses');
  });

  it('excludes the boundary day itself, so the window is exactly 30 days', () => {
    // 2026-07-29 minus 30 days = 2026-06-29. That day is the exclusive bound.
    const onBoundary = [spend(resto.id, '2026-06-29')];
    const dayAfter = [spend(resto.id, '2026-06-30')];

    expect(rankExpenseCategories(all, onBoundary, TODAY)[0]?.name).toBe('Courses');
    expect(rankExpenseCategories(all, dayAfter, TODAY)[0]?.name).toBe('Restaurant');
  });

  it('breaks an equal count by most recent use', () => {
    const history = [
      spend(resto.id, '2026-07-10'),
      spend(courses.id, '2026-07-27'),
      spend(carburant.id, '2026-07-15'),
    ];

    expect(rankExpenseCategories(all, history, TODAY).map((c) => c.name)).toEqual([
      'Courses',
      'Carburant',
      'Restaurant',
    ]);
  });

  it('is stable across two calls on the same data — chips must not reshuffle', () => {
    const history = [spend(courses.id, '2026-07-27'), spend(resto.id, '2026-07-27')];
    const first = rankExpenseCategories(all, history, TODAY).map((c) => c.id);
    const second = rankExpenseCategories(all, history, TODAY).map((c) => c.id);
    expect(second).toEqual(first);
  });

  it('falls back to declaration order on a workspace with no history', () => {
    expect(rankExpenseCategories(all, [], TODAY).map((c) => c.name)).toEqual([
      'Courses',
      'Carburant',
      'Restaurant',
    ]);
  });

  it('ignores uncategorised expenses instead of crashing on them', () => {
    const history = [spend(null, '2026-07-27'), spend(null, '2026-07-28')];
    expect(rankExpenseCategories(all, history, TODAY)).toHaveLength(3);
  });

  it('handles a month boundary in the window arithmetic', () => {
    // 2026-01-15 minus 30 days crosses into the previous year.
    const history = [spend(resto.id, '2025-12-20'), spend(courses.id, '2026-01-14')];
    expect(rankExpenseCategories(all, history, '2026-01-15').map((c) => c.name)).toEqual([
      'Courses',
      'Restaurant',
      'Carburant',
    ]);
  });
});

describe('expenseCategoryChips — one row, never two', () => {
  const many = Array.from({ length: 9 }, (_, i) => cat(`Cat${i}`));

  it(`caps the row at ${CHIP_COUNT} and pushes the rest to overflow`, () => {
    // §3.4, measured on the rendered mockup: at 6 chips they wrap to a second
    // row and push the « Ajouter » button below the keyboard.
    const { chips, overflow } = expenseCategoryChips(many, [], TODAY);
    expect(chips).toHaveLength(CHIP_COUNT);
    expect(overflow).toHaveLength(many.length - CHIP_COUNT);
  });

  /*
    F-6 — this case used to read « pre-selects the first chip so the common
    case costs no tap », on an EMPTY history. On a fresh workspace the first
    chip is only the first in declaration order: pre-selecting it filed the
    first expenses under a category nobody chose. The expectation was wrong,
    not the arithmetic, and it is replaced by the three cases below.
  */
  it('pre-selects nothing on a workspace with no use in the window (F-6)', () => {
    const { chips, preselectedId } = expenseCategoryChips(many, [], TODAY);
    expect(chips.length).toBeGreaterThan(0);
    expect(preselectedId).toBeNull();
  });

  it('pre-selects the most-used category once there is use in the window', () => {
    const history = [
      spend(many[3]!.id, '2026-07-20'),
      spend(many[3]!.id, '2026-07-21'),
      spend(many[1]!.id, '2026-07-22'),
    ];
    const { chips, preselectedId } = expenseCategoryChips(many, history, TODAY);
    expect(preselectedId).toBe(many[3]!.id);
    expect(chips[0]?.id).toBe(many[3]!.id);
  });

  it('pre-selects nothing when every use is older than the window', () => {
    // Use counted the way `rankExpenseCategories` counts it: 40 days back is
    // outside the window, so it is no use at all for the pre-selection either.
    const history = [spend(many[2]!.id, '2026-06-19')];
    expect(expenseCategoryChips(many, history, TODAY).preselectedId).toBeNull();
  });

  it('pre-selects nothing when the only use is uncategorised', () => {
    const history = [spend(null, '2026-07-28')];
    expect(expenseCategoryChips(many, history, TODAY).preselectedId).toBeNull();
  });

  it('reports no pre-selection when nothing is selectable', () => {
    const billsOnly = [cat('Taxes', 'fixed'), cat('Assurances', 'fixed')];
    const { chips, preselectedId } = expenseCategoryChips(billsOnly, [], TODAY);
    expect(chips).toEqual([]);
    expect(preselectedId).toBeNull();
  });

  it('loses no category between chips and overflow', () => {
    const { chips, overflow } = expenseCategoryChips(many, [], TODAY);
    expect([...chips, ...overflow].map((c) => c.id).sort()).toEqual(many.map((c) => c.id).sort());
  });
});
