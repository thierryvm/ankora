/**
 * Shape of the ⊕ sheet's context.
 *
 * In a sibling file rather than next to the action itself: a `'use server'`
 * module may export ONLY async functions (`CLAUDE.md` rule 9, enforced by
 * `npm run lint:use-server` in CI). Types are erased at build time, so a
 * type-only export there looks harmless — and is exactly the drift that rule
 * exists to stop, because the day someone adds a non-async *value* next to it
 * the boundary is already blurred.
 */

export type ExpenseEntryCategory = {
  id: string;
  name: string;
  colorToken: string;
};

export type ExpenseEntryContext = {
  /** The five most-used selectable categories, most-used first. */
  chips: ExpenseEntryCategory[];
  /** The rest, behind the « ＋ » chip. Bill categories are in NEITHER (ADR-035 §5). */
  overflow: ExpenseEntryCategory[];
  /** The chip to pre-select — `null` when the workspace has no usable category. */
  preselectedId: string | null;
  /** « Il te reste » right now, so the sheet can show what a spend would leave. */
  ilTeReste: number;
  /** « Budget du mois » — the anchor. */
  budgetDuMois: number;
  /**
   * « Dépensé ce mois » right now.
   *
   * The pivot of the optimistic couple: the sheet needs it to announce the
   * RESULTING spend total alongside the resulting « Il te reste », so the curve
   * of the month moves with the hero instead of freezing beside it. Deriving it
   * from the other two on the client would be a second computation of the same
   * sum at display time — what `CLAUDE.md` rule 10 forbids, and how two
   * readings of one month start to drift apart.
   */
  depensesDuMois: number;
  /** True when income is not configured: no figure may be shown (THI-335). */
  incomplet: boolean;
  /** Today in Europe/Brussels, so the date field defaults to the user's day. */
  todayIso: string;
};
