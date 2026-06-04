'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Simulation, type Money } from '@/lib/domain';
import type { Locale } from '@/i18n/routing';
import type { formatCurrency } from '@/lib/i18n/formatters';

/**
 * SimulatorProjection — 6-month comparative projection inside the simulator
 * Impact card (model: "scenario impact over time").
 *
 * Two lines (validated design @thierry 2026-06-04):
 *   - "Sans changement" = flat dashed baseline at the current réserve libre.
 *   - "Avec ce choix"    = baseline + cumulative monthly delta (rises/falls).
 *   - Soft gradient area between them = the cumulative gain/loss.
 *   - Discrete € y-axis, locale month labels, endpoint value, no heavy grid.
 *
 * **CSP-safe by construction** (SVG geometry attributes + `fill`/`stroke` +
 * a `<linearGradient>` def — never an inline `style`), zero chart lib (budget
 * 0 €, bundle 0, SSR/RSC-friendly). Colour adapts: success (gain) / danger
 * (loss). When the delta is zero the chart is suppressed (neutral line).
 *
 * FSMA: pure arithmetic on the entered scenario. Both `monthlyDelta` and
 * `baseline` are `Money` passed client→client (no RSC boundary crossed).
 */

const VIEW_W = 380;
const VIEW_H = 190;
const MARGIN = { left: 44, right: 48, top: 14, bottom: 26 };
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom;
const DEFAULT_MONTHS = 6;

export function SimulatorProjection({
  monthlyDelta,
  baseline,
  fmtMoney,
  months = DEFAULT_MONTHS,
}: {
  monthlyDelta: Money;
  /** Current réserve libre — the flat "Sans changement" reference line. */
  baseline: Money;
  /**
   * Locale-aware currency formatter from the parent (accepts `Money | number`).
   * Passing a function client→client crosses no RSC boundary.
   */
  fmtMoney: (value: Parameters<typeof formatCurrency>[0]) => string;
  months?: number;
}) {
  const t = useTranslations('app.simulator.impact');
  const locale = useLocale() as Locale;
  const gradId = useId();

  const isZero = monthlyDelta.isZero();
  const positive = monthlyDelta.gt(0);
  const cumul = Simulation.projectCumulative(monthlyDelta, months); // Money

  if (isZero) {
    return (
      <p
        className="text-muted-foreground border-border border-t pt-3 text-sm"
        data-testid="simulator-cumul6m"
      >
        {t('cumul6mNeutral')}
      </p>
    );
  }

  const base = baseline.toNumber();
  const delta = monthlyDelta.toNumber();
  // Scenario = baseline + cumulative delta, month by month (k = 0..months).
  const scenario = Array.from({ length: months + 1 }, (_, k) => base + delta * k);

  const dataMin = Math.min(base, ...scenario);
  const dataMax = Math.max(base, ...scenario);
  const span = dataMax - dataMin || Math.max(1, Math.abs(base) * 0.1);
  const lo = dataMin - span * 0.55;
  const hi = dataMax + span * 0.55;

  const xAt = (i: number) => MARGIN.left + (i / months) * PLOT_W;
  const yAt = (v: number) => MARGIN.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;

  const baselineY = yAt(base);
  const endX = xAt(months);
  const endY = yAt(scenario[months]!);

  const scenarioPath = scenario
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
    .join(' ');
  const areaPath =
    `${scenarioPath} L ${endX.toFixed(1)} ${baselineY.toFixed(1)}` +
    ` L ${xAt(0).toFixed(1)} ${baselineY.toFixed(1)} Z`;

  // Discrete y-axis: 3 ticks (lo / mid / hi), rounded to a clean step.
  const yTicks = [lo, (lo + hi) / 2, hi];

  // Locale month labels (current month + k forward).
  const now = new Date();
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  const monthLabel = (k: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const s = monthFmt.format(d).replace('.', '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const lineColor = positive ? 'var(--color-success)' : 'var(--color-danger)';
  const ariaLabel = t('projectionAria', { from: fmtMoney(0), to: fmtMoney(cumul) });
  const cumulText = positive
    ? t('cumul6mGain', { amount: fmtMoney(cumul.abs()) })
    : t('cumul6mLoss', { amount: fmtMoney(cumul.abs()) });
  const endLabel = `${positive ? '+' : '−'}${fmtMoney(cumul.abs())}`;

  return (
    <div
      className="border-border flex flex-col gap-2.5 border-t pt-3"
      data-testid="simulator-projection"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-muted-foreground text-xs font-medium">{t('projectionTitle')}</p>
        <ul className="flex items-center gap-3 text-xs">
          <li className="flex items-center gap-1.5">
            <svg
              aria-hidden="true"
              width="14"
              height="3"
              className="text-muted-foreground inline-block"
            >
              <line
                x1="0"
                y1="1.5"
                x2="14"
                y2="1.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="3 2"
              />
            </svg>
            <span className="text-muted-foreground">{t('projectionBaselineLegend')}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <svg
              aria-hidden="true"
              width="14"
              height="3"
              className={`inline-block ${positive ? 'text-success' : 'text-danger'}`}
            >
              <line x1="0" y1="1.5" x2="14" y2="1.5" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="text-muted-foreground">{t('projectionScenarioLegend')}</span>
          </li>
        </ul>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={ariaLabel}
        className="block h-auto w-full"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Discrete y-axis: faint gridline + muted € label per tick. */}
        {yTicks.map((v, i) => (
          <g key={`y${i}`}>
            <line
              x1={MARGIN.left}
              x2={VIEW_W - MARGIN.right}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke="var(--color-border)"
              strokeWidth="1"
              strokeOpacity="0.5"
            />
            <text
              x={MARGIN.left - 8}
              y={yAt(v) + 3}
              textAnchor="end"
              fontSize="9.5"
              fill="var(--color-muted-foreground)"
              opacity="0.85"
            >
              {fmtMoney(Math.round(v))}
            </text>
          </g>
        ))}

        {/* Locale month labels. */}
        {scenario.map((_, i) => (
          <text
            key={`x${i}`}
            x={xAt(i)}
            y={VIEW_H - 8}
            textAnchor="middle"
            fontSize="9.5"
            fill="var(--color-muted-foreground)"
            opacity="0.85"
          >
            {monthLabel(i)}
          </text>
        ))}

        {/* Baseline "Sans changement" — dashed reference. */}
        <line
          x1={MARGIN.left}
          x2={VIEW_W - MARGIN.right}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--color-muted-foreground)"
          strokeWidth="1.5"
          strokeDasharray="5 4"
          strokeOpacity="0.6"
        />

        {/* Scenario area + line "Avec ce choix". */}
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={scenarioPath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Start dot (on baseline) + endpoint halo/dot + value. */}
        <circle
          cx={xAt(0)}
          cy={baselineY}
          r="3.2"
          fill="var(--color-card)"
          stroke="var(--color-muted-foreground)"
          strokeWidth="2"
        />
        <circle cx={endX} cy={endY} r="5.5" fill={lineColor} fillOpacity="0.18" />
        <circle
          cx={endX}
          cy={endY}
          r="3.4"
          fill="var(--color-card)"
          stroke={lineColor}
          strokeWidth="2"
        />
        <text x={endX + 8} y={endY + 3} fontSize="12" fontWeight="700" fill={lineColor}>
          {endLabel}
        </text>
      </svg>

      <p
        className="text-foreground text-sm font-medium tabular-nums"
        data-testid="simulator-cumul6m"
      >
        {cumulText}
      </p>
    </div>
  );
}
