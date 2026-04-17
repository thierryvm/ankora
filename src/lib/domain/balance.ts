import { money, zero, type Expense, type Money } from '@/lib/domain/types';

export type BalanceSummary = {
  totalSpent: Money;
  byCategoryId: Map<string | null, Money>;
  count: number;
};

/**
 * Aggregate expenses over a closed month (inclusive start, exclusive end).
 * Pure — caller filters the input list if a narrower window is needed.
 */
export function summarizeExpenses(expenses: readonly Expense[]): BalanceSummary {
  const byCategoryId = new Map<string | null, Money>();
  let totalSpent = zero();

  for (const expense of expenses) {
    totalSpent = totalSpent.plus(expense.amount);
    const current = byCategoryId.get(expense.categoryId) ?? zero();
    byCategoryId.set(expense.categoryId, current.plus(expense.amount));
  }

  return { totalSpent, byCategoryId, count: expenses.length };
}

/**
 * Remaining budget for a given month = income - fixed_charges_due - variable_spent.
 * All three values are caller-supplied; this is a thin arithmetic helper kept
 * pure so UI and server code share the same source of truth.
 */
export function remainingBudget(income: Money, chargesDue: Money, variableSpent: Money): Money {
  if (income.lt(0)) throw new RangeError('income must be >= 0');
  if (chargesDue.lt(0)) throw new RangeError('chargesDue must be >= 0');
  if (variableSpent.lt(0)) throw new RangeError('variableSpent must be >= 0');
  return income.minus(chargesDue).minus(variableSpent);
}

/**
 * Simple daily-spend guideline for the rest of the month.
 * Returns 0 if remaining budget is non-positive or no days remain.
 */
export function dailyAllowance(remaining: Money, daysLeft: number): Money {
  if (daysLeft <= 0 || remaining.lte(0)) return zero();
  return remaining.div(daysLeft);
}

export const balanceHelpers = { money };
