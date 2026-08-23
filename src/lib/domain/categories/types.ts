/**
 * Categories are a READING axis, never a CALCULATION axis (ADR-022).
 *
 * Nothing in this folder may be imported by `cockpit/` or by any function that
 * produces a monetary total. Changing an expense's category must not move a
 * single aggregate.
 *
 * ## What actually holds this, and what does not — checked 2026-08-23
 *
 * This comment used to cite `__tests__/category-is-not-a-calculation-axis.test.ts`
 * as the proof. **That file does not exist**, anywhere in the repository. So the
 * strongest-sounding claim above — "changing a category moves no aggregate" —
 * has never been asserted by anything. It is held by convention.
 *
 * What IS asserted, and where:
 * `cockpit/__tests__/pas-de-double-comptage.test.ts` §"the interface cannot
 * invite the violation" proves the neighbouring — and narrower — invariant: a
 * `kind: 'fixed'` category is never offered in the expense picker, so a bill can
 * never be filed as an expense and deducted twice.
 *
 * The gap is deliberate to name rather than paper over: repointing this comment
 * at a test that proves something else would have restored the appearance of
 * proof without the proof. Tracked in ADR-043 §"Ce qui reste ouvert".
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
