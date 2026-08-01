import type { Expense } from '@/lib/domain/types';

import type { Category } from './types';

/**
 * Which categories may be offered when recording an EXPENSE, and in what order.
 *
 * ## Why a filter exists at all — the non-double-counting invariant
 *
 * ADR-035 §5: *a `charge` or `commitment` occurrence is NEVER an `expense`; the
 * two universes are disjoint.* `resteDisponible` already deducts every bill as
 * smoothed monthly effort, so an expense filed under « Assurances » or « Taxes »
 * would deduct the same money a second time, and « Il te reste » would be
 * quietly wrong by exactly the amount of a bill the user thought they were
 * being diligent about recording.
 *
 * The invariant is enforced in the domain (nothing writes a charge occurrence
 * into `expenses`), but an invariant the interface INVITES the user to violate
 * is a bad invariant. So the corollary is structural: `kind: 'fixed'`
 * categories are never offered in the expense picker. The user cannot make the
 * mistake, rather than being told off for making it.
 *
 * `income` is excluded for the obvious reason — an expense is not a receipt.
 *
 * ## Ordering: measured use, not an alphabet
 *
 * `DECISIONS-ANKORA.md` §3.4 asks for the five most-used categories over 30
 * days, the first pre-selected, so the common case costs zero taps. Everything
 * below is about making that ordering *deterministic*, because a picker whose
 * chips reshuffle between two openings is worse than one that never learned.
 */

/** Days of history the ranking looks at. §3.4 — recent habits, not a lifetime. */
export const RANKING_WINDOW_DAYS = 30;

/** Chips that fit on one row at 390 px without wrapping (§3.4, measured on the mockup). */
export const CHIP_COUNT = 5;

/**
 * Categories a hand-entered expense may be filed under.
 *
 * Declaration order is preserved — callers that want use-ranking call
 * `rankExpenseCategories`.
 */
export function selectableExpenseCategories(categories: readonly Category[]): readonly Category[] {
  return categories.filter((category) => category.kind === 'variable');
}

/** Is this category one an expense may be filed under? */
export function isSelectableForExpense(category: Category): boolean {
  return category.kind === 'variable';
}

/**
 * ISO date `days` before `todayIso`, exclusive lower bound of the window.
 *
 * Built through `Date.UTC` rather than the local constructor: `occurredOn` is a
 * zone-less calendar date, and a local-midnight round-trip would shift the
 * window by a day for half the world. The result is compared as a string, which
 * is exact for ISO dates.
 */
function windowStart(todayIso: string, days: number): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const start = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - days));
  return start.toISOString().slice(0, 10);
}

/**
 * Selectable categories, most-used-first over the last {@link RANKING_WINDOW_DAYS}.
 *
 * Ties are broken by most recent use, then by declaration order — never by
 * `Array.prototype.sort` stability alone, because "the chips moved and I don't
 * know why" is the failure mode this ordering exists to avoid. Categories with
 * no use in the window keep their declaration order at the tail, so a fresh
 * workspace shows a stable, sensible list instead of an arbitrary one.
 */
export function rankExpenseCategories(
  categories: readonly Category[],
  expenses: readonly Expense[],
  todayIso: string,
  windowDays: number = RANKING_WINDOW_DAYS,
): readonly Category[] {
  const selectable = selectableExpenseCategories(categories);
  const since = windowStart(todayIso, windowDays);

  const uses = new Map<string, { count: number; lastUsed: string }>();
  for (const expense of expenses) {
    if (expense.categoryId === null) continue;
    // `> since` and not `>=`: the window is the last N days, so the boundary
    // day itself is already out of it.
    if (expense.occurredOn <= since) continue;
    const current = uses.get(expense.categoryId);
    if (current) {
      current.count += 1;
      if (expense.occurredOn > current.lastUsed) current.lastUsed = expense.occurredOn;
    } else {
      uses.set(expense.categoryId, { count: 1, lastUsed: expense.occurredOn });
    }
  }

  const position = new Map(selectable.map((category, index) => [category.id, index]));

  return [...selectable].sort((a, b) => {
    const useA = uses.get(a.id);
    const useB = uses.get(b.id);
    const countDelta = (useB?.count ?? 0) - (useA?.count ?? 0);
    if (countDelta !== 0) return countDelta;
    const lastA = useA?.lastUsed ?? '';
    const lastB = useB?.lastUsed ?? '';
    if (lastA !== lastB) return lastA < lastB ? 1 : -1;
    return (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0);
  });
}

/**
 * The chip row and the id to pre-select.
 *
 * `preselectedId` is the first chip, which is the most-used category — right in
 * the large majority of entries. Changing it costs a third tap, and that is
 * assumed (§3.4): a miscategorised expense stays fixable in two taps from the
 * list, whereas making everyone choose costs a tap on *every* entry.
 *
 * `null` when the workspace has no selectable category at all — the caller must
 * render an empty state rather than a row of nothing.
 */
export function expenseCategoryChips(
  categories: readonly Category[],
  expenses: readonly Expense[],
  todayIso: string,
): { chips: readonly Category[]; overflow: readonly Category[]; preselectedId: string | null } {
  const ranked = rankExpenseCategories(categories, expenses, todayIso);
  return {
    chips: ranked.slice(0, CHIP_COUNT),
    overflow: ranked.slice(CHIP_COUNT),
    preselectedId: ranked[0]?.id ?? null,
  };
}
