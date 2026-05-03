import { zero, type Expense, type Money } from '@/lib/domain/types';

/**
 * Sum of all expense amounts. Returns zero for an empty list.
 * Pure helper — no I/O, no Date.now() — safe to property-test.
 */
export function totalAmount(expenses: readonly Expense[]): Money {
  return expenses.reduce((acc, expense) => acc.plus(expense.amount), zero());
}

/**
 * Top N expenses ordered by `occurredOn` descending (most recent first).
 * Stable sort preserved by `Array.prototype.sort` in V8/Node 24.
 * Throws on negative `limit`. Returns the original list (sorted) if `limit`
 * exceeds its length.
 */
export function latestExpenses(expenses: readonly Expense[], limit: number): Expense[] {
  if (limit < 0) throw new RangeError(`limit must be >= 0, received ${limit}`);
  if (limit === 0) return [];
  return [...expenses]
    .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0))
    .slice(0, limit);
}
