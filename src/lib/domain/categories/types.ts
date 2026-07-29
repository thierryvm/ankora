/**
 * Categories are a READING axis, never a CALCULATION axis (ADR-022).
 *
 * Nothing in this folder may be imported by `cockpit/` or by any function that
 * produces a monetary total. Changing an expense's category must not move a
 * single aggregate — an invariant asserted in
 * `__tests__/category-is-not-a-calculation-axis.test.ts`.
 */

/**
 * `categories.kind` as constrained by the initial schema.
 *
 * - `fixed`   — a recurring-bill category (Taxes, Assurances, Abonnements…).
 * - `variable`— hand-entered day-to-day spending.
 * - `income`  — incoming money.
 */
export const CATEGORY_KINDS = ['fixed', 'variable', 'income'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/**
 * The 8 palette tokens `categories.color_token` is constrained to
 * (`20260503000003_pr_d1_categories_enrichments.sql`). Kept a closed set on
 * purpose (ADR-022 §4): an arbitrary hex blows up WCAG AA contrast and breaks
 * the visual contract. A design decision, not a limitation.
 */
export const CATEGORY_COLOR_TOKENS = [
  'blue',
  'pink',
  'rose',
  'emerald',
  'purple',
  'amber',
  'cyan',
  'zinc',
] as const;
export type CategoryColorToken = (typeof CATEGORY_COLOR_TOKENS)[number];

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  colorToken: CategoryColorToken;
  isSystem: boolean;
};
