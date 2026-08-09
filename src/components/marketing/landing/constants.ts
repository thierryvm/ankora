/**
 * Illustrative figures for the public landing.
 *
 * These numbers are NOT real user data — they're the showroom figures used
 * by the Hero statement card and the Feature waterfall. Display strings are
 * pre-formatted per locale in the i18n bundles (`messages/{locale}.json`),
 * with NBSP separators kept for fr-BE only — see Sourcery #1 / PR #82
 * pattern. The numeric constants below remain the source of truth for tests
 * and any future computation.
 */

/**
 * Hero « relevé corrigé » card (PR L2, ADR-039).
 *
 * The statement the visitor already knows, corrected: the balance read at
 * the bank, minus two dated committed amounts, equals what is still truly
 * theirs. `trulyYours` is NOT one of the four reserved cockpit figures
 * (ADR-035) and is not computed by the app — it exists only as this
 * pedagogical object: `bankBalance − insurance − tax`, guarded by a unit
 * test so the card can never contradict its own arithmetic.
 */
export const RELEVE_DEMO = {
  /** The balance as read on the bank statement (illustrative). */
  bankBalance: 1240,
  /** Car insurance, debited on a known date this month. */
  insurance: 280,
  /** Road tax, due in November. */
  tax: 162,
  /** What remains once the two commitments are counted (= 1240 − 280 − 162). */
  trulyYours: 798,
} as const;

/**
 * Hero waterfall — 3-step canonical cashflow (PR-3c-4).
 *
 * Consumed by `Feature.tsx` (with the `landing.hero.waterfall.*` i18n
 * subtree) until PR L3 migrates both to the feature namespace. Kept intact
 * here per the L2 plan — do not rename or move before L3.
 *
 * Replaces the previous 5-step mockup (`WATERFALL_BARS` removed) which
 * incorrectly mixed transfers (Provisions, Réserve) with real outflows
 * (Dépenses courantes) and over-represented provisions as a primary
 * siphon. The 3-step model matches `claude-design-brief.md` L95 + L250
 * (*"salary → envelopes → expenses"*) and the audit verdict at
 * `Athenaeum/10_Projects/ankora/analysis/2026-04-28-waterfall-coherence-audit.md`.
 *
 * `provisions` is rendered as a discreet sub-caption under the expenses
 * step ("dont 59 € lissés vers provisions affectées"), not as a standalone
 * step. The `available` figure is the visible bottom-line user takeaway
 * and equals `income − expenses` by construction.
 */
export const HERO_WATERFALL_DEMO = {
  /** Monthly income (illustrative, anchored on real anonymised user data). */
  income: 2466,
  /** Daily expenses incl. fixed bills + subscriptions + provision smoothing. */
  expenses: 1959,
  /** Discreet sub-segment of expenses smoothed into earmarked provisions. */
  provisions: 59,
  /** Bottom-line money available after expenses (= income − expenses). */
  available: 507,
} as const;

/**
 * Browser-chrome decorative dots (macOS window controls metaphor).
 *
 * DORMANT since PR L2: the rewritten Hero dropped the browser mockup, and a
 * grep at that point found no other consumer. Kept intact per the L2 plan —
 * PR L3 (sections restyle) decides whether the Feature mockup adopts or
 * deletes it. Colours are semantic Tailwind classes mapping to the design
 * system.
 */
export const HERO_BROWSER_DOTS: readonly { key: string; className: string }[] = [
  { key: 'close', className: 'bg-danger/40' },
  { key: 'minimise', className: 'bg-warning/40' },
  { key: 'maximise', className: 'bg-success/40' },
];
