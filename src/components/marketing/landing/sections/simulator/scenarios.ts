import { PiggyBank, Sparkles, TrendingUp } from '@/components/marketing/landing/icons';
import type { LucideIcon } from 'lucide-react';

/**
 * WhatIfDemo — fixed scenarios shown in the public landing simulator.
 *
 * Mirrors `Landing.jsx` cc-design `<WhatIfDemo>` (lines 182-364):
 * - Three pre-baked scenarios (GSM renegotiation, electricity supplier swap,
 *   streaming cuts) with realistic Belgian price ranges.
 * - Slider min/max/step/default come from the mockup verbatim — not user data.
 * - `baseline` is the current monthly charge (illustrative), `default` is the
 *   slider's resting position when the scenario is selected.
 *
 * Constants are intentionally non-translatable (numbers + icons). Only the
 * `label` and `hint` texts are i18n keys read from `landing.whatif.scenarios.*`.
 */
export type WhatIfScenarioId = 'gsm' | 'elec' | 'stream';

export type WhatIfScenario = {
  readonly id: WhatIfScenarioId;
  readonly icon: LucideIcon;
  readonly baseline: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
};

export const WHAT_IF_SCENARIOS: readonly WhatIfScenario[] = [
  { id: 'gsm', icon: Sparkles, baseline: 42, min: 0, max: 22, step: 1, default: 14 },
  { id: 'elec', icon: TrendingUp, baseline: 168, min: 0, max: 45, step: 5, default: 25 },
  { id: 'stream', icon: PiggyBank, baseline: 38, min: 0, max: 25, step: 1, default: 18 },
] as const;

/**
 * Baseline reserve trajectory (€) over 6 months — illustrative, drifts with
 * seasonality. Same numbers as cc-design `Landing.jsx` line 198.
 */
export const RESERVE_BASELINE_6M = [480, 612, 740, 866, 988, 1108] as const;

/**
 * Share of monthly savings Ankora suggests routing to long-term savings.
 * Used in the "Sur 12 mois" card sub-text (factual, FSMA-safe — Ankora
 * "could route" not "will earn"). Matches cc-design line 290.
 */
export const FLECHE_RATIO = 0.7;

/**
 * i18n key suffixes for the SVG x-axis month labels. Matches cc-design line 196
 * but read via `landing.whatif.chart.months.{key}` so locales stay in control.
 */
export const PROJECTION_MONTH_KEYS = ['may', 'jun', 'jul', 'aug', 'sep', 'oct'] as const;

/**
 * Threshold zones drawn behind the projection chart.
 *
 * Decided 2026-04-28 (`docs/design/copywriting-review-2026-04-28.md` §5.1):
 * three coloured `<rect>` strips give a discreet emotional read of the
 * trajectory without claiming any guarantee. Labels stay descriptive
 * ("Zone fragile", "Zone confortable") — not prescriptive — to honour the
 * FSMA blocklist.
 *
 * Colour values come from the semantic CSS tokens (`--color-danger`,
 * `--color-warning`, `--color-success`) — they auto-flip in dark mode and
 * under `[data-accent="admin"]`. Opacity stays low (10-12%) so the strips
 * never compete with the data path.
 *
 * `aria-hidden="true"` is mandatory: the numbers (start/end labels, axis,
 * legend) carry the same information for screen readers, and the strips
 * have no semantic value of their own.
 */
export type ThresholdKey = 'danger' | 'fragile' | 'comfortable';

export type ThresholdZone = {
  readonly key: ThresholdKey;
  /** Lower bound in € (inclusive). `null` means -∞. */
  readonly min: number | null;
  /** Upper bound in € (exclusive). `null` means +∞. */
  readonly max: number | null;
  /** i18n key under `landing.whatif.chart.thresholds.{key}`. */
  readonly labelKey: ThresholdKey;
  /** CSS custom property exposing the zone's semantic colour. */
  readonly cssVar: string;
  /** Fill opacity of the SVG `<rect>` strip. Capped at 12% to stay discreet. */
  readonly opacity: number;
};

export const THRESHOLD_ZONES: readonly ThresholdZone[] = [
  {
    key: 'danger',
    min: null,
    max: 0,
    labelKey: 'danger',
    cssVar: 'var(--color-danger)',
    opacity: 0.12,
  },
  {
    key: 'fragile',
    min: 0,
    max: 200,
    labelKey: 'fragile',
    cssVar: 'var(--color-warning)',
    opacity: 0.12,
  },
  {
    key: 'comfortable',
    min: 200,
    max: null,
    labelKey: 'comfortable',
    cssVar: 'var(--color-success)',
    opacity: 0.1,
  },
] as const;
