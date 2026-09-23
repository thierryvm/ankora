import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { groupExpensesByDescription } from '../expenses/group-by-description';

/**
 * The expenses of the month, grouped by description — « where did it go? ».
 *
 * Rule 10: the month total opens on what composes it. Each group is one line
 * of that decomposition, so the sum of the groups must BE the total, to the
 * cent — which is why the arithmetic is Decimal and not float.
 */

type Row = { id: string; label: string; amount: number; occurredOn: string };

let seq = 0;
function row(label: string, amount: number, occurredOn: string): Row {
  seq += 1;
  return { id: `e${seq}`, label, amount, occurredOn };
}

describe('groupExpensesByDescription', () => {
  it('returns no group for no expense', () => {
    expect(groupExpensesByDescription([])).toEqual([]);
  });

  it('groups by folded description: case and accents do not split a place', () => {
    const groups = groupExpensesByDescription([
      row('Intermarché', 10, '2026-09-02'),
      row('INTERMARCHE', 5, '2026-09-10'),
      row('Pharmacie', 7, '2026-09-05'),
    ]);
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([
      ['intermarche', 2],
      ['pharmacie', 1],
    ]);
  });

  it('shows each group under its most recent description', () => {
    const [group] = groupExpensesByDescription([
      row('intermarché', 10, '2026-09-02'),
      row('Intermarché', 5, '2026-09-10'),
    ]);
    expect(group?.label).toBe('Intermarché');
  });

  it('on the same day, keeps the description listed first (the list is newest-first)', () => {
    const [group] = groupExpensesByDescription([
      row('Colruyt', 1, '2026-09-10'),
      row('COLRUYT', 1, '2026-09-10'),
    ]);
    expect(group?.label).toBe('Colruyt');
  });

  it('sums each group in Decimal, to the cent', () => {
    const [group] = groupExpensesByDescription([
      row('Café', 0.1, '2026-09-01'),
      row('Café', 0.2, '2026-09-02'),
    ]);
    // 0.1 + 0.2 in float is 0.30000000000000004.
    expect(group?.subtotal.toString()).toBe('0.3');
    expect(group?.subtotal).toBeInstanceOf(Decimal);
  });

  it('orders the groups from the largest subtotal to the smallest', () => {
    const groups = groupExpensesByDescription([
      row('Pharmacie', 7.05, '2026-09-05'),
      row('Colruyt', 5.05, '2026-09-01'),
      row('Colruyt', 5.05, '2026-09-02'),
      row('Boulangerie', 50.5, '2026-09-03'),
    ]);
    expect(groups.map((g) => [g.label, g.subtotal.toNumber()])).toEqual([
      ['Boulangerie', 50.5],
      ['Colruyt', 10.1],
      ['Pharmacie', 7.05],
    ]);
  });

  it('breaks an equal subtotal by most recent use, then by description', () => {
    const groups = groupExpensesByDescription([
      row('Alpha', 5, '2026-09-01'),
      row('Gamma', 5, '2026-09-01'),
      row('Beta', 5, '2026-09-09'),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('lists the expenses of a group newest first', () => {
    const [group] = groupExpensesByDescription([
      row('Colruyt', 1, '2026-09-01'),
      row('Colruyt', 2, '2026-09-20'),
      row('Colruyt', 3, '2026-09-10'),
    ]);
    expect(group?.items.map((i) => i.occurredOn)).toEqual([
      '2026-09-20',
      '2026-09-10',
      '2026-09-01',
    ]);
  });

  it('keeps the rows themselves, so the list can still edit them', () => {
    const r = row('Colruyt', 1, '2026-09-01');
    expect(groupExpensesByDescription([r])[0]?.items[0]).toBe(r);
  });

  it('the subtotals add up to the total of the expenses, exactly', () => {
    const rows = [
      row('Colruyt', 5.05, '2026-09-01'),
      row('colruyt', 7.05, '2026-09-02'),
      row('Pharmacie', 0.1, '2026-09-03'),
      row('Pharmacie', 0.2, '2026-09-04'),
      row('Boulangerie', 505.05, '2026-09-05'),
      row('!!', 1, '2026-09-06'),
    ];
    const sum = groupExpensesByDescription(rows).reduce(
      (acc, g) => acc.plus(g.subtotal),
      new Decimal(0),
    );
    const total = rows.reduce((acc, r) => acc.plus(r.amount), new Decimal(0));
    expect(sum.equals(total)).toBe(true);
    expect(sum.toString()).toBe('518.45');
  });

  it('keeps a description made only of punctuation as its own group', () => {
    const groups = groupExpensesByDescription([
      row('!!', 1, '2026-09-06'),
      row('Colruyt', 2, '2026-09-06'),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Colruyt', '!!']);
  });
});
