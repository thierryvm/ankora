import { fold } from '@/lib/domain/expense-descriptions';
import { money, type Money } from '@/lib/domain/types';

/**
 * The word the entry sheet writes when an expense has neither description nor
 * category — `app.expenses.addSheet.fallbackLabel`, in every locale the sheet
 * may have been used in. It names no place. Kept in step with the messages by
 * `expense-entry.test.ts`.
 */
export const EXPENSE_FALLBACK_LABELS = ['Dépense', 'Uitgave', 'Expense', 'Ausgabe', 'Gasto'];

const FALLBACK_KEYS = new Set(EXPENSE_FALLBACK_LABELS.map(fold));

/** True when a description is only the sheet's fallback word. */
export function isFallbackLabel(label: string): boolean {
  return FALLBACK_KEYS.has(fold(label));
}

export type MergeRow = Readonly<{
  id: string;
  workspaceId: string;
  categoryId: string | null;
  label: string;
  amount: number | string | Money;
}>;

export type CategoryMergePlan = Readonly<{
  /** The expenses that change category, in input order. */
  movedExpenseIds: string[];
  /**
   * One entry per source whose expenses carried only the fallback word: they
   * take the source's name as description, so « Intermarché » survives the
   * category it used to be.
   */
  relabels: Array<{ label: string; expenseIds: string[] }>;
  /** The workspace's rows as they will be after the merge. */
  after: Array<MergeRow>;
}>;

/**
 * Regroup several categories into one post (« Courses »): the category says
 * what for, the description says where (DESIGN-v3 rule 26).
 *
 * Pure: the server reads the rows, this decides what to write, the server
 * writes it. A row of another workspace is never part of the plan, whatever
 * its category id. Amounts are never touched — only `categoryId`, and `label`
 * where it was the fallback word.
 */
export function planCategoryMerge(input: {
  workspaceId: string;
  sources: ReadonlyArray<Readonly<{ id: string; name: string }>>;
  targetId: string;
  rows: ReadonlyArray<MergeRow>;
}): CategoryMergePlan {
  const { workspaceId, sources, targetId } = input;
  if (sources.some((s) => s.id === targetId)) {
    throw new Error('planCategoryMerge: the target cannot be one of the sources');
  }
  const nameOf = new Map(sources.map((s) => [s.id, s.name]));
  const relabelOf = new Map<string, string[]>();
  const movedExpenseIds: string[] = [];
  const after: MergeRow[] = [];

  for (const row of input.rows) {
    if (row.workspaceId !== workspaceId) continue;
    const sourceName = row.categoryId === null ? undefined : nameOf.get(row.categoryId);
    if (sourceName === undefined) {
      after.push(row);
      continue;
    }
    movedExpenseIds.push(row.id);
    const relabel = isFallbackLabel(row.label);
    if (relabel) {
      const ids = relabelOf.get(row.categoryId!) ?? [];
      ids.push(row.id);
      relabelOf.set(row.categoryId!, ids);
    }
    after.push({ ...row, categoryId: targetId, label: relabel ? sourceName : row.label });
  }

  const relabels = sources.flatMap((s) => {
    const ids = relabelOf.get(s.id);
    return ids ? [{ label: s.name, expenseIds: ids }] : [];
  });
  return { movedExpenseIds, relabels, after };
}

/** Sum per category, in Decimal — the check that a merge moved money without changing it. */
export function totalsByCategory(rows: ReadonlyArray<MergeRow>): Map<string | null, Money> {
  const totals = new Map<string | null, Money>();
  for (const row of rows) {
    totals.set(row.categoryId, (totals.get(row.categoryId) ?? money(0)).plus(money(row.amount)));
  }
  return totals;
}
