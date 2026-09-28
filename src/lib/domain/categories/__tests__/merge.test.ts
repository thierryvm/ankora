import { describe, expect, it } from 'vitest';

import { ownDescriptionsFrom } from '@/lib/domain/expense-descriptions';
import { money } from '@/lib/domain/types';

import { EXPENSE_FALLBACK_LABELS, planCategoryMerge, totalsByCategory } from '../merge';

/** Fictional data only (public repository): two shop categories and a « Courses » post. */
const WS = 'ws-1';
const SOURCES = [
  { id: 'cat-inter', name: 'Intermarché' },
  { id: 'cat-colruyt', name: 'Colruyt' },
];
const TARGET = 'cat-courses';

const rows = [
  { id: 'e1', workspaceId: WS, categoryId: 'cat-inter', label: 'Intermarché', amount: '100.10' },
  { id: 'e2', workspaceId: WS, categoryId: 'cat-inter', label: 'Dépense', amount: '49.07' },
  { id: 'e3', workspaceId: WS, categoryId: 'cat-colruyt', label: 'pain', amount: '8.59' },
  { id: 'e4', workspaceId: WS, categoryId: 'cat-colruyt', label: 'Expense', amount: '0.01' },
  { id: 'e5', workspaceId: WS, categoryId: TARGET, label: 'Marché', amount: '12.30' },
  { id: 'e6', workspaceId: WS, categoryId: 'cat-sante', label: 'Pharmacie', amount: '7.00' },
  // Another workspace, with a category id that collides on purpose.
  { id: 'x1', workspaceId: 'ws-2', categoryId: 'cat-inter', label: 'Dépense', amount: '999.99' },
] as const;

describe('planCategoryMerge', () => {
  const plan = planCategoryMerge({ workspaceId: WS, sources: SOURCES, targetId: TARGET, rows });

  it('moves every expense of the sources, and only those', () => {
    expect([...plan.movedExpenseIds].sort()).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('keeps every amount to the cent: the target now holds the sources plus itself', () => {
    const before = totalsByCategory(rows.filter((r) => r.workspaceId === WS));
    const after = totalsByCategory(plan.after);
    const expected = money(before.get(TARGET)!)
      .plus(before.get('cat-inter')!)
      .plus(before.get('cat-colruyt')!);
    expect(after.get(TARGET)!.toFixed(2)).toBe(expected.toFixed(2));
    expect(after.get(TARGET)!.toFixed(2)).toBe('170.07');
    expect(after.get('cat-sante')!.toFixed(2)).toBe('7.00');
    expect(after.has('cat-inter')).toBe(false);
    expect(after.has('cat-colruyt')).toBe(false);
    // Nothing created, nothing lost: the grand total does not move.
    const sum = (m: Map<string | null, ReturnType<typeof money>>) =>
      [...m.values()].reduce((s, v) => s.plus(v), money(0)).toFixed(2);
    expect(sum(after)).toBe(sum(before));
  });

  it('writes the old category name where the description was the fallback word', () => {
    expect(plan.relabels).toEqual([
      { label: 'Intermarché', expenseIds: ['e2'] },
      { label: 'Colruyt', expenseIds: ['e4'] },
    ]);
    const byId = new Map(plan.after.map((r) => [r.id, r.label]));
    expect(byId.get('e1')).toBe('Intermarché');
    expect(byId.get('e2')).toBe('Intermarché');
    expect(byId.get('e3')).toBe('pain');
    expect(byId.get('e4')).toBe('Colruyt');
    expect(byId.get('e5')).toBe('Marché');
  });

  it('touches nothing of another workspace, even with a colliding category id', () => {
    expect(plan.movedExpenseIds).not.toContain('x1');
    expect(plan.after.some((r) => r.id === 'x1')).toBe(false);
    expect(plan.relabels.flatMap((r) => r.expenseIds)).not.toContain('x1');
  });

  it('recognises the fallback word in every locale, whatever its case', () => {
    expect(EXPENSE_FALLBACK_LABELS).toEqual(['Dépense', 'Uitgave', 'Expense', 'Ausgabe', 'Gasto']);
    const p = planCategoryMerge({
      workspaceId: WS,
      sources: [{ id: 's', name: 'Colruyt' }],
      targetId: TARGET,
      rows: [
        { id: 'a', workspaceId: WS, categoryId: 's', label: 'DEPENSE', amount: 1 },
        { id: 'b', workspaceId: WS, categoryId: 's', label: 'Uitgave', amount: 1 },
      ],
    });
    expect(p.relabels).toEqual([{ label: 'Colruyt', expenseIds: ['a', 'b'] }]);
  });

  it('refuses a target that is also a source', () => {
    expect(() =>
      planCategoryMerge({ workspaceId: WS, sources: SOURCES, targetId: 'cat-inter', rows }),
    ).toThrow();
  });
});

describe('the description suggestions follow the merge', () => {
  const plan = planCategoryMerge({ workspaceId: WS, sources: SOURCES, targetId: TARGET, rows });
  const sources = plan.after.map((r, i) => ({
    label: r.label,
    categoryId: r.categoryId,
    occurredOn: '2026-09-10',
    createdAt: `2026-09-10T10:00:0${i}Z`,
  }));
  const suggestion = (categoryNames: string[]) =>
    ownDescriptionsFrom(sources, { categoryNames, fallbackLabels: EXPENSE_FALLBACK_LABELS }).find(
      (d) => d.label.startsWith('Inter'),
    );

  it('once the emptied categories are deleted, « Inter » offers « Intermarché » in « Courses »', () => {
    const s = suggestion(['Courses', 'Santé']);
    expect(s).toMatchObject({ label: 'Intermarché', categoryId: TARGET, count: 2 });
  });

  it('while the emptied « Intermarché » category still exists, its name stays silent', () => {
    // Existing rule of ownDescriptionsFrom: a description equal to a category
    // name is what the sheet writes for an empty description. The merge sheet
    // therefore offers to delete the emptied categories right after.
    expect(suggestion(['Courses', 'Santé', 'Intermarché', 'Colruyt'])).toBeUndefined();
  });
});
