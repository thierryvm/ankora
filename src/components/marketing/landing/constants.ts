/**
 * Illustrative figures for the public landing.
 *
 * These numbers are NOT real user data — they're the showroom KPIs and
 * waterfall steps used in the Hero/Feature sections. Hero KPIs come from
 * the cc-design `Landing.jsx` mockup. The hero waterfall steps were
 * realigned in PR-3c-4 to the 3-canonical-step model (Revenus → Dépenses
 * courantes → Argent disponible) per `docs/design/claude-design-brief.md`
 * L95 + L250 and the audit at
 * `Athenaeum/10_Projects/ankora/analysis/2026-04-28-waterfall-coherence-audit.md`.
 *
 * Numbers are anchored on a real anonymised user case (~2 466 € income,
 * ~1 959 € expenses, ~59 € provision smoothing, ~507 € available) so the
 * landing visualises a coherent monthly cashflow rather than the original
 * cc-design 5-step mockup that over-represented provisions as a 980 €
 * siphon.
 *
 * Localisation: amounts are pre-formatted per locale in the i18n bundles
 * (`messages/{locale}.json` under `landing.hero.waterfall.*` and
 * `landing.hero.kpis.*`), with NBSP separators kept for fr-BE only — see
 * Sourcery #1 / PR #82 pattern. The numeric constants below remain the
 * source of truth for tests and any future computation.
 */

export type HeroKpi = {
  /** i18n key under `landing.hero.kpis.{key}.label` and `.sub`. */
  key: 'netRemaining' | 'provisions' | 'reserve';
  /** Pre-formatted display value (NBSP separator, no currency). */
  display: string;
  /**
   * Tailwind text colour class (token-based — no hex literal).
   * Maps to the design-system token, not the raw cc-design hex.
   */
  toneClass: string;
};

export const HERO_KPIS: readonly HeroKpi[] = [
  // Switched from `text-success-300` (#34d399, sub-AA on white at xl size:
  // 1.78:1) to `text-success` (#059669, AA at xl). axe-core flagged this on
  // PR #78 — the KPI amounts ARE read by screen readers (informational), so
  // the "illustrative decorative" reasoning didn't apply. Vivid emerald is
  // gone in light mode but kept in dark via the same token's lightness.
  { key: 'netRemaining', display: '480 €', toneClass: 'text-success' },
  // Switched from `text-accent-400` (fresh brass #d4a017, sub-AA on white,
  // documented in SKILL.md) to `text-accent-text` (aged brass #8b6914 light /
  // fresh brass #d4a017 dark — AA on white, AAA on navy). Same laiton story,
  // proper contrast across modes.
  { key: 'provisions', display: '1 660 €', toneClass: 'text-accent-text' },
  // Switched from `text-brand-300` (#5eead4 teal-300, sub-AA on white) to
  // `text-brand-text-strong` (#115e59 light / #5eead4 dark — AAA both modes).
  { key: 'reserve', display: '614 €', toneClass: 'text-brand-text-strong' },
];

/**
 * Hero waterfall — 3-step canonical cashflow (PR-3c-4).
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
 * Hero sparkline — pre-baked SVG path from cc-design `Landing.jsx` line 101-102.
 * 9-point line over 900×120 viewBox, used as a glassy mockup decoration in the
 * Hero card. Do not animate — purely decorative.
 */
export const HERO_SPARKLINE = {
  viewBox: '0 0 900 120',
  height: 120,
  /** Closed area path (line + bottom edge) for the gradient fill. */
  areaPath:
    'M0 80 L 100 70 L 200 75 L 300 55 L 400 48 L 500 72 L 600 64 L 700 42 L 800 50 L 900 38 L 900 120 L 0 120 Z',
  /** Open line path (no fill, just the stroke). */
  linePath:
    'M0 80 L 100 70 L 200 75 L 300 55 L 400 48 L 500 72 L 600 64 L 700 42 L 800 50 L 900 38',
} as const;

/**
 * Hero "browser chrome" decorative dots above the mockup card. Pure cosmetic
 * (mimics macOS window controls). Colours are intentional UI metaphors, kept
 * as semantic Tailwind classes that map to the design system.
 */
export const HERO_BROWSER_DOTS: readonly { key: string; className: string }[] = [
  { key: 'close', className: 'bg-danger/40' },
  { key: 'minimise', className: 'bg-warning/40' },
  { key: 'maximise', className: 'bg-success/40' },
];
