import { summarizeExpenses } from '@/lib/domain/balance';
import type { CategoryColorToken } from '@/lib/domain/categories/types';
import type { Expense, Money } from '@/lib/domain/types';

export type CategorieDuMois = Readonly<{
  /** The category id; null for the expenses filed under no category. */
  id: string | null;
  /** The category name; null when none (no category, or one this workspace no longer lists). */
  nom: string | null;
  couleur: CategoryColorToken | null;
  /** `summarizeExpenses().byCategoryId` — the sum is the domain's, not re-done here. */
  total: Money;
  /** The group's expenses, oldest first. */
  lignes: Expense[];
}>;

/**
 * The month's expenses by category — the groups of the « Catégories » card
 * (G-cat) and of its drawer `g-cat`.
 *
 * No new sum: the subtotals are `summarizeExpenses().byCategoryId`, the same
 * aggregation the domain already had. This only names each group, attaches its
 * rows (a filter, not an addition) and orders them largest first — ties by
 * name, then by id, so two renders never swap two groups. The expenses without
 * a category form their own group (id null): every expense lands in exactly
 * one group, so the subtotals add up to the month total to the cent (rule 10).
 */
export function categoriesDuMois(
  expenses: readonly Expense[],
  categories: ReadonlyArray<Readonly<{ id: string; name: string; colorToken: CategoryColorToken }>>,
): CategorieDuMois[] {
  const { byCategoryId } = summarizeExpenses(expenses);
  const parId = new Map(categories.map((c) => [c.id, c]));
  return [...byCategoryId]
    .map(([id, total]) => {
      const cat = id === null ? undefined : parId.get(id);
      return {
        id,
        nom: cat?.name ?? null,
        couleur: cat?.colorToken ?? null,
        total,
        lignes: expenses
          .filter((e) => e.categoryId === id)
          .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id)),
      };
    })
    .sort(
      (a, b) =>
        b.total.comparedTo(a.total) ||
        (a.nom ?? '￿').localeCompare(b.nom ?? '￿') ||
        String(a.id).localeCompare(String(b.id)),
    );
}
