import { fold } from '@/lib/domain/expense-descriptions';
import { money, type Money } from '@/lib/domain/types';

/** The minimum an expense row needs to be grouped. */
export type GroupableExpense = {
  label: string;
  amount: number | string | Money;
  occurredOn: string;
};

export type ExpenseGroup<T extends GroupableExpense> = {
  /** Folded description — the identity of the group. */
  key: string;
  /** The description as written on its most recent expense. */
  label: string;
  /** Sum of the group, in Decimal: the groups must add up to the total exactly. */
  subtotal: Money;
  /** The rows themselves, newest first. */
  items: T[];
};

/**
 * Expenses grouped by description — « where did the money go this month? ».
 *
 * CLAUDE.md rule 10: the month total opens on what composes it. Each group is
 * one line of that decomposition, so every row lands in exactly one group and
 * the subtotals add up to the total to the cent.
 *
 * The key is the folded description, so « Intermarché » and « INTERMARCHE »
 * are one place. A description that folds to nothing (punctuation only) keeps
 * its own trimmed text as key rather than merging with every other such row.
 *
 * Ordering: largest subtotal first; ties by most recent expense, then by key,
 * so two renders of the same month never swap two groups.
 */
export function groupExpensesByDescription<T extends GroupableExpense>(
  items: readonly T[],
): ExpenseGroup<T>[] {
  const groups = new Map<string, ExpenseGroup<T> & { lastOn: string }>();

  for (const item of items) {
    const key = fold(item.label) || item.label.trim();
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        key,
        label: item.label,
        subtotal: money(item.amount),
        items: [item],
        lastOn: item.occurredOn,
      });
      continue;
    }
    group.subtotal = group.subtotal.plus(money(item.amount));
    group.items.push(item);
    // Strictly newer only: on the same day the row listed first keeps the
    // title, and the list arrives newest-first.
    if (item.occurredOn > group.lastOn) {
      group.label = item.label;
      group.lastOn = item.occurredOn;
    }
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        b.subtotal.comparedTo(a.subtotal) ||
        b.lastOn.localeCompare(a.lastOn) ||
        a.key.localeCompare(b.key),
    )
    .map(({ key, label, subtotal, items: rows }) => ({
      key,
      label,
      subtotal,
      // Stable sort: rows of the same day keep their incoming order.
      items: [...rows].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)),
    }));
}
