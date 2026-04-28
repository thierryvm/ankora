'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Check, Sparkles, TrendingUp } from '@/components/marketing/landing/icons';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Num } from '@/components/ui/num';
import { cn } from '@/lib/utils';

import {
  FLECHE_RATIO,
  PROJECTION_MONTH_KEYS,
  RESERVE_BASELINE_6M,
  THRESHOLD_ZONES,
  WHAT_IF_SCENARIOS,
  type WhatIfScenarioId,
} from './simulator/scenarios';

/**
 * SVG geometry — matches cc-design `Landing.jsx` line 200 (`W = 480, H = 220, P = 32`).
 * The plot top sits 12px above the highest gridline (`H - P*2 - 12`).
 */
const W = 480;
const H = 220;
const P = 32;
const PLOT_TOP = P + 12;
const FLEX_BASELINE = H - P * 2 - 12;

/**
 * WhatIfDemoClient — interactive simulator (slider + chart).
 *
 * Mirrors the inner half of cc-design `WhatIfDemo` (`Landing.jsx` 207-361):
 * - Two-column grid placed by the parent `<Glass>` wrapper
 * - LEFT: scenario buttons + savings slider + 12-month KPI card
 * - RIGHT: header + SVG projection (6 months, threshold zones, baseline +
 *   scenario paths, edge labels) + caveat box
 *
 * Improvements over the cc-design source (validated 2026-04-28
 * `docs/design/copywriting-review-2026-04-28.md`):
 * - **Threshold zones**: 3 colour bands (`var(--color-danger|warning|success)`)
 *   give a discreet emotional read of the trajectory. `aria-hidden="true"`
 *   because the values + legend already carry the same information.
 * - **Tokens for SVG colours**: `var(--color-brand-text-strong)` for edge
 *   labels (AAA both modes) instead of the cc-design hardcoded `#5eead4`.
 * - **`prefers-reduced-motion`**: `motion-reduce:transition-none` on every
 *   transitioning element (paths, button hovers, icon background).
 * - **Slider accent**: `accent-color: var(--color-brand-400)` so the native
 *   range thumb stays in sync with `[data-accent="admin"]` flips.
 *
 * Numbers (baseline, max, default, FLECHE_RATIO) are illustrative — see
 * `simulator/scenarios.ts`. Caveat reminds users this is a demo and Ankora
 * never imports bank data.
 */
export function WhatIfDemoClient() {
  const t = useTranslations('landing.whatif');
  // Pull the active locale so number formatting (slider value, annual KPI,
  // SVG edge labels) follows the user's chosen language. Hardcoding `fr-BE`
  // would mismatch the rest of the UI on EN / NL / DE / ES.
  const locale = useLocale();

  const [scenarioId, setScenarioId] = useState<WhatIfScenarioId>('gsm');
  // `find` is safe — scenarioId is constrained to keys that always exist.
  const scenario = WHAT_IF_SCENARIOS.find((s) => s.id === scenarioId)!;
  const [savingsValue, setSavingsValue] = useState(scenario.default);

  // Snap the slider back to the new scenario's resting position whenever the
  // user picks a different scenario (cc-design line 192 behaviour).
  useEffect(() => {
    setSavingsValue(scenario.default);
  }, [scenario]);

  const monthly = savingsValue;
  const yearly = monthly * 12;
  const fleche = Math.round(monthly * FLECHE_RATIO);
  const newSeries = RESERVE_BASELINE_6M.map((b, i) => b + monthly * (i + 1));
  const yMax = Math.max(...newSeries, 1500);

  const xAt = (i: number) => P + (i / (PROJECTION_MONTH_KEYS.length - 1)) * (W - P * 2);
  const yAt = (v: number) => H - P - (v / yMax) * FLEX_BASELINE;

  const yAt0 = yAt(0);
  const yAt200 = yAt(200);

  const pathFor = (series: readonly number[]) =>
    series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
  const areaFor = (series: readonly number[]) =>
    `${pathFor(series)} L ${xAt(series.length - 1)} ${H - P} L ${xAt(0)} ${H - P} Z`;

  // Threshold zone rectangles, computed against the visible plot area.
  // `danger` (< 0 €) renders as a 12px strip in the bottom padding so it
  // stays visible even though the scenarios never produce negative values.
  const getZoneRect = (zoneKey: 'danger' | 'fragile' | 'comfortable') => {
    if (zoneKey === 'danger') {
      return { x: P, y: H - P, width: W - P * 2, height: 12 };
    }
    if (zoneKey === 'fragile') {
      return { x: P, y: yAt200, width: W - P * 2, height: Math.max(0, yAt0 - yAt200) };
    }
    return { x: P, y: PLOT_TOP, width: W - P * 2, height: Math.max(0, yAt200 - PLOT_TOP) };
  };

  const formatNumber = (n: number) => {
    const formatted = n.toLocaleString(locale);
    return n > 0 ? `+${formatted}` : formatted;
  };
  const formatEur = (n: number) => `${formatNumber(n)} €`;

  return (
    <>
      {/* LEFT — controls */}
      <div className="border-border grid content-start gap-5 border-b p-7 md:border-r md:border-b-0 md:p-8">
        {/* Scenario picker */}
        <div>
          <Eyebrow className="mb-2.5">{t('controls.scenario')}</Eyebrow>
          <div className="grid gap-1.5">
            {WHAT_IF_SCENARIOS.map((s) => {
              const active = s.id === scenarioId;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScenarioId(s.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition motion-reduce:transition-none',
                    'focus-visible:ring-brand-400/60 focus-visible:ring-2 focus-visible:outline-none',
                    active
                      ? 'border-brand-surface-border bg-brand-surface text-foreground'
                      : 'border-border text-muted-foreground hover:bg-card/40 hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-6 w-6 flex-none place-items-center rounded-md transition-colors motion-reduce:transition-none',
                      active
                        ? 'bg-brand-surface-border text-brand-text-strong'
                        : 'bg-card/40 text-muted-foreground',
                    )}
                  >
                    <Icon aria-hidden="true" className="h-3 w-3" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{t(`scenarios.${s.id}.label`)}</span>
                  {active && (
                    <Check
                      aria-hidden="true"
                      className="text-brand-text-strong h-3.5 w-3.5 flex-none"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Savings slider */}
        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <Eyebrow>{t('controls.savings')}</Eyebrow>
            <Num size="sm" className="text-brand-text-strong text-base font-semibold">
              {formatEur(monthly)}
            </Num>
          </div>
          <input
            type="range"
            min={scenario.min}
            max={scenario.max}
            step={scenario.step}
            value={savingsValue}
            onChange={(e) => setSavingsValue(Number(e.target.value))}
            aria-label={t('controls.slider_aria', {
              label: t(`scenarios.${scenarioId}.label`),
            })}
            style={{ accentColor: 'var(--color-brand-400)' }}
            className="h-6 w-full"
          />
          <div className="text-muted-foreground mt-0.5 flex justify-between font-mono text-xs">
            <span>{scenario.min} €</span>
            <span>+ {scenario.max} €</span>
          </div>
          <p className="text-muted-foreground mt-3 text-xs leading-relaxed text-pretty">
            {t(`scenarios.${scenarioId}.hint`)}
          </p>
        </div>

        {/* 12-month KPI card */}
        <div className="bg-brand-surface border-brand-surface-border grid gap-1 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Eyebrow tone="accent">{t('annual.eyebrow')}</Eyebrow>
            <TrendingUp aria-hidden="true" className="text-brand-text-strong h-3.5 w-3.5" />
          </div>
          <Num size="xl" tone="accent">
            {formatEur(yearly)}
          </Num>
          <p className="text-muted-foreground text-xs leading-relaxed text-pretty">
            {t('annual.fleche', { amount: formatNumber(fleche) })}
          </p>
        </div>
      </div>

      {/* RIGHT — projection chart */}
      <div className="grid content-start gap-3.5 p-7 md:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div>
            <Eyebrow>{t('chart.title')}</Eyebrow>
            <p className="font-display text-foreground mt-1 text-base font-semibold">
              {t('chart.subtitle')}
            </p>
          </div>
          <ul className="flex items-center gap-3.5 text-xs">
            <li className="flex items-center gap-1.5">
              {/* Inline SVG line so the marker colour comes from currentColor —
                  `bg-muted-foreground` is forbidden by `docs/design/token-usage.md` §3. */}
              <svg
                aria-hidden="true"
                width="10"
                height="2"
                className="text-muted-foreground inline-block"
              >
                <line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="text-muted-foreground">{t('chart.legend.baseline')}</span>
            </li>
            <li className="flex items-center gap-1.5">
              <svg aria-hidden="true" width="10" height="2" className="text-brand-400 inline-block">
                <line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="text-brand-text-strong">{t('chart.legend.scenario')}</span>
            </li>
          </ul>
        </div>

        {/* SVG card */}
        <div className="bg-card/60 border-border rounded-xl border p-3">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={t('chart.aria')}
            className="block h-auto w-full"
          >
            <defs>
              <linearGradient id="ankora-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-400)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--color-brand-400)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Threshold zones (decorative — info redundant with values + legend) */}
            <g aria-hidden="true">
              {THRESHOLD_ZONES.map((zone) => {
                const rect = getZoneRect(zone.key);
                return (
                  <rect
                    key={zone.key}
                    data-threshold={zone.key}
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill={zone.cssVar}
                    fillOpacity={zone.opacity}
                  />
                );
              })}
            </g>

            {/* Gridlines (4 horizontal, low opacity) */}
            <g aria-hidden="true">
              {[0.25, 0.5, 0.75, 1].map((g) => {
                const y = H - P - g * FLEX_BASELINE;
                return (
                  <line
                    key={g}
                    x1={P}
                    x2={W - P}
                    y1={y}
                    y2={y}
                    stroke="var(--color-foreground)"
                    strokeOpacity="0.05"
                    strokeWidth="1"
                    strokeDasharray="2 4"
                  />
                );
              })}
            </g>

            {/* Baseline path (dashed — "without change") */}
            <path
              d={pathFor(RESERVE_BASELINE_6M)}
              fill="none"
              stroke="var(--color-muted-foreground)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              strokeOpacity="0.7"
            />

            {/* Scenario area + line — animated on slider change */}
            <path
              data-testid="whatif-area"
              d={areaFor(newSeries)}
              fill="url(#ankora-area)"
              className="transition-[d] duration-200 motion-reduce:transition-none"
            />
            <path
              data-testid="whatif-line"
              d={pathFor(newSeries)}
              fill="none"
              stroke="var(--color-brand-400)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-[d] duration-200 motion-reduce:transition-none"
            />

            {/* Scenario points + first/last edge labels */}
            {newSeries.map((v, i) => {
              const isEdge = i === 0 || i === newSeries.length - 1;
              return (
                <g key={i}>
                  <circle
                    cx={xAt(i)}
                    cy={yAt(v)}
                    r="3.5"
                    fill="var(--color-card)"
                    stroke="var(--color-brand-400)"
                    strokeWidth="2"
                  />
                  {isEdge && (
                    <text
                      x={xAt(i)}
                      y={yAt(v) - 12}
                      fontSize="10"
                      fontFamily="var(--font-mono)"
                      fontWeight="600"
                      fill="var(--color-brand-text-strong)"
                      textAnchor={i === 0 ? 'start' : 'end'}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {v.toLocaleString(locale)} €
                    </text>
                  )}
                </g>
              );
            })}

            {/* X-axis month labels */}
            <g aria-hidden="true">
              {PROJECTION_MONTH_KEYS.map((monthKey, i) => (
                <text
                  key={monthKey}
                  x={xAt(i)}
                  y={H - 10}
                  fontSize="10"
                  fontFamily="var(--font-sans)"
                  fontWeight="500"
                  fill="var(--color-muted-foreground)"
                  textAnchor="middle"
                >
                  {t(`chart.months.${monthKey}`)}
                </text>
              ))}
            </g>
          </svg>
        </div>

        {/* Caveat box */}
        <div className="bg-card/40 border-border flex items-start gap-2.5 rounded-lg border p-3">
          <span
            aria-hidden="true"
            className="bg-accent-surface text-accent-text mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md"
          >
            <Sparkles className="h-3 w-3" />
          </span>
          <p className="text-muted-foreground text-xs leading-relaxed text-pretty">{t('caveat')}</p>
        </div>
      </div>
    </>
  );
}
