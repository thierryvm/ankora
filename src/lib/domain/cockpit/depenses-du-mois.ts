import { depensesDuMoisDeBudget, type RevenuDuJournal } from '@/lib/domain/budget/mois-de-budget';
import { totalAmount } from '@/lib/domain/expenses/helpers';
import { type Expense, type Money } from '@/lib/domain/types';

import type { ReferencePeriod } from './types';

/**
 * Sum of the hand-entered expenses that fall inside a reference month.
 *
 * This is number 3 of the four-figure glossary (ADR-035), displayed as
 * « Dépensé ce mois ». It is what makes the hero figure move when the user
 * records a spend — before it existed, `resteDisponible` ignored expenses
 * entirely and the feedback loop stayed open.
 *
 * **Non-double-counting invariant (ADR-035).** A `charge` or `commitment`
 * occurrence is NEVER an `expense`. The two universes are disjoint: charges
 * and commitments are already deducted from `resteDisponible` as smoothed
 * monthly effort, so an occurrence that also appeared in `expenses` would be
 * subtracted twice and the hero would be quietly wrong. The `expenses` table
 * holds only variable, manually entered spending.
 *
 * Filtering is done on the `YYYY-MM` prefix of `occurredOn` rather than by
 * constructing dates: `occurredOn` is an ISO calendar date with no time or
 * zone, so a `new Date()` round-trip would reintroduce a timezone question
 * that the data does not have. The prefix comparison is exact and total.
 *
 * ADR-047 — « the month » is the BUDGET month: an expense made after the
 * income « for » the next month arrived belongs to that next month
 * (`mois-de-budget.ts`, the one ranging every reader follows). Without any
 * income passed, the ranging is the calendar month, exactly as before.
 */
export function depensesDuMois(
  expenses: readonly Expense[],
  ref: ReferencePeriod,
  revenus: readonly RevenuDuJournal[] = [],
): Money {
  return totalAmount(depensesDuMoisDeBudget(expenses, ref, revenus));
}
