/**
 * Constants for the public landing simulator.
 *
 * Scenario deltas are intentionally simple integer Euros — the landing simulator
 * is a what-if projection (no real charges), not a connected dashboard. The
 * underlying math reuses `projectCumulative` from `src/lib/domain/simulation`,
 * which is covered by the Phase T1 fast-check property suite.
 *
 * Refs: PR-3c brief @cowork (2026-04-27), ADR-006 §T1.
 */

export type ScenarioKey = 'steady' | 'balanced' | 'ambitious';

export const SCENARIO_KEYS: readonly ScenarioKey[] = ['steady', 'balanced', 'ambitious'] as const;

/** Monthly amount set aside, in EUR, by scenario. */
export const SCENARIO_DELTAS: Readonly<Record<ScenarioKey, number>> = {
  steady: 50,
  balanced: 100,
  ambitious: 200,
} as const;

/** Slider range overriding the scenario delta. */
export const SLIDER_RANGE = {
  min: 10,
  max: 500,
  step: 10,
} as const;

/** Projection horizon (months) — locked at 12 for the v1.0 landing. */
export const PROJECTION_MONTHS = 12;

export const DEFAULT_SCENARIO: ScenarioKey = 'balanced';
