import type { CategoryKind } from './types';

/** What a written `category_id` is attached to. */
export type CategoryUse = 'expense' | 'charge' | 'commitment';

/**
 * Which category kinds each kind of write may reference.
 *
 * - An expense takes a `variable` category only. `fixed` is a bill category and
 *   would deduct a bill a second time (ADR-035 §5, `isSelectableForExpense`);
 *   `income` is not spending.
 * - A charge or a commitment takes `fixed` or `variable`, never `income`. Both
 *   kinds are needed: the historical bill categories (Logement, Santé,
 *   Transport…) were seeded as `variable`, and existing bills are filed there.
 */
const ALLOWED_KINDS: Readonly<Record<CategoryUse, readonly CategoryKind[]>> = {
  expense: ['variable'],
  charge: ['fixed', 'variable'],
  commitment: ['fixed', 'variable'],
};

/**
 * May a write of this `use` reference a category of this `kind`?
 *
 * `kind` is typed as a plain string because it comes from the database row: an
 * unknown value is refused rather than trusted.
 */
export function isCategoryKindAllowedFor(use: CategoryUse, kind: string): boolean {
  return (ALLOWED_KINDS[use] as readonly string[]).includes(kind);
}
