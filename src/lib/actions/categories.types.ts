import type { CategoryColorToken } from '@/lib/domain/categories';

/**
 * Ce que rend la création d'une catégorie de dépense.
 *
 * Dans un fichier à part, **sans** `'use server'` : un fichier porteur de la
 * directive ne peut exporter que des fonctions async (règle 9 du `CLAUDE.md`,
 * vérifiée par `npm run lint:use-server`). Un type y serait exposé comme un
 * endpoint qui n'existe pas. Même découpage que `expense-entry.types.ts`.
 *
 * Le client en a besoin pour ajouter la catégorie à sa rangée sans re-solliciter
 * le serveur — c'est ce qui la rend visible immédiatement après création.
 */
export type CreatedExpenseCategory = {
  id: string;
  name: string;
  colorToken: CategoryColorToken;
};

/** One expense category as the merge sheet lists it, with what it holds. */
export type MergeableCategory = {
  id: string;
  name: string;
  colorToken: string | null;
  isSystem: boolean;
  /** Every expense filed under it, all months. */
  expenseCount: number;
  /** Bills and commitments filed under it: they follow the merge too. */
  billCount: number;
};

export type CategoryMergeResult = {
  targetId: string;
  movedExpenses: number;
  /** The sources, now empty and still there: deleting them is a separate gesture. */
  emptiedCategoryIds: string[];
};
