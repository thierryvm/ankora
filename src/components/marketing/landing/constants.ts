/**
 * Illustrative figures for the public landing.
 *
 * These numbers are NOT real user data — they're the showroom KPIs and
 * waterfall bars copied 1:1 from the cc-design `Landing.jsx` mockup
 * (`design-exports/unpacked-v1/.../landing_page/Landing.jsx`).
 *
 * They are not translatable: amounts use the international `1 660` format
 * (NBSP separator) and stay identical across locales. Only the labels
 * (`netRemaining`, `provisions`, `reserve`, `salary`, etc.) are i18n keys
 * read in the section components.
 *
 * Colour tokens use the shared design-system palette so the `[data-theme]`
 * and `[data-accent]` flips remap them consistently. Where a hex from the
 * mockup has no exact token equivalent, we picked the nearest semantic
 * token and noted the substitution — see Hero/Feature sections in PR-3c-2
 * report for the audit.
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
  // cc-design hex #34d399 — exact match with `--color-success-300` (added
  // in PR-3c-2 checkpoint per @cowork Q2 — illustrative KPI, intentionally
  // sub-AA on light because the "Aperçu cockpit" eyebrow signals decoration).
  { key: 'netRemaining', display: '480 €', toneClass: 'text-success-300' },
  // cc-design hex #d4a017 — exact match with `--color-accent-400` (laiton).
  { key: 'provisions', display: '1 660 €', toneClass: 'text-accent-400' },
  // cc-design hex #5eead4 — exact match with `--color-brand-300` (teal-300).
  { key: 'reserve', display: '614 €', toneClass: 'text-brand-300' },
];

export type WaterfallBar = {
  /** i18n key under `landing.feature.bars.{key}`. */
  key: 'salary' | 'provisions' | 'life' | 'reserve' | 'remaining';
  /** SVG x-coordinate (viewBox 0..400). */
  x: number;
  /** Bar height in SVG units (max 160 = full height). */
  height: number;
  /** Pre-formatted display value (NBSP separator, sign, no currency). */
  display: string;
  /** Tailwind fill class for the SVG `<rect>`. */
  fillClass: string;
  /** Tailwind text class for the value label sitting above the bar. */
  textClass: string;
};

export const WATERFALL_BARS: readonly WaterfallBar[] = [
  // #2dd4bf brand-400 (teal vif).
  {
    key: 'salary',
    x: 20,
    height: 160,
    display: '+3 200',
    fillClass: 'fill-brand-400',
    textClass: 'text-brand-400',
  },
  // #d4a017 accent-400 (laiton).
  {
    key: 'provisions',
    x: 100,
    height: 50,
    display: '−980',
    fillClass: 'fill-accent-400',
    textClass: 'text-accent-400',
  },
  // #38bdf8 → token --color-info (#0284c7, slightly darker).
  {
    key: 'life',
    x: 180,
    height: 70,
    display: '−1 420',
    fillClass: 'fill-info',
    textClass: 'text-info',
  },
  // #5eead4 brand-300 (teal-300).
  {
    key: 'reserve',
    x: 260,
    height: 16,
    display: '−320',
    fillClass: 'fill-brand-300',
    textClass: 'text-brand-300',
  },
  // #34d399 → token text-success (slightly darker, see HERO_KPIS netRemaining note).
  {
    key: 'remaining',
    x: 340,
    height: 24,
    display: '+480',
    fillClass: 'fill-success',
    textClass: 'text-success',
  },
];

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
export const HERO_BROWSER_DOTS: readonly { className: string }[] = [
  { className: 'bg-danger/40' }, // close
  { className: 'bg-warning/40' }, // minimise
  { className: 'bg-success/40' }, // maximise
];
