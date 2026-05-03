import { describe, it, expect } from 'vitest';
import { money, type Expense } from '@/lib/domain/types';
import { latestExpenses, totalAmount } from '@/lib/domain/expenses';

const base = {
  categoryId: null,
  note: null,
  paidFrom: 'vie_courante',
} satisfies Partial<Expense>;

const groceries: Expense = {
  ...base,
  id: 'e1',
  label: 'Course supermarché',
  amount: money(35.5),
  occurredOn: '2026-05-03',
};
const lunch: Expense = {
  ...base,
  id: 'e2',
  label: 'Restaurant midi',
  amount: money(18),
  occurredOn: '2026-05-02',
};
const fuel: Expense = {
  ...base,
  id: 'e3',
  label: 'Plein essence',
  amount: money(89),
  occurredOn: '2026-05-01',
};
const earlierMonth: Expense = {
  ...base,
  id: 'e4',
  label: 'Pharmacie',
  amount: money(12.4),
  occurredOn: '2026-04-29',
};

describe('totalAmount', () => {
  it('returns zero for an empty list', () => {
    expect(totalAmount([]).toNumber()).toBe(0);
  });

  it('sums positive amounts with two-decimal precision', () => {
    expect(totalAmount([groceries, lunch, fuel]).toNumber()).toBe(142.5);
  });

  it('does not mutate the input list', () => {
    const list = [groceries, lunch];
    const snapshot = [...list];
    totalAmount(list);
    expect(list).toEqual(snapshot);
  });
});

describe('latestExpenses', () => {
  it('returns top N ordered by occurredOn descending', () => {
    const result = latestExpenses([fuel, lunch, groceries, earlierMonth], 3);
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('returns the full sorted list when limit exceeds length', () => {
    const result = latestExpenses([fuel, groceries], 10);
    expect(result.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('returns empty array when limit is 0', () => {
    expect(latestExpenses([groceries, lunch], 0)).toEqual([]);
  });

  it('returns empty array for an empty list', () => {
    expect(latestExpenses([], 5)).toEqual([]);
  });

  it('throws for a negative limit', () => {
    expect(() => latestExpenses([groceries], -1)).toThrow(RangeError);
  });

  it('does not mutate the input list', () => {
    const list = [fuel, lunch, groceries];
    const snapshot = [...list];
    latestExpenses(list, 2);
    expect(list).toEqual(snapshot);
  });

  it('keeps stable order for expenses on the same day', () => {
    const sameDayA: Expense = {
      ...base,
      id: 'sa',
      label: 'A',
      amount: money(5),
      occurredOn: '2026-05-03',
    };
    const sameDayB: Expense = {
      ...base,
      id: 'sb',
      label: 'B',
      amount: money(7),
      occurredOn: '2026-05-03',
    };
    const result = latestExpenses([sameDayA, sameDayB], 2);
    expect(result.map((e) => e.id)).toEqual(['sa', 'sb']);
  });
});
