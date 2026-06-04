'use client';

import { useCallback, useId, useRef, useState } from 'react';
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
 * **Responsive container, 1:1 pixels** (fix 2026-06-04): the SVG is rendered at
 * the measured container width with a matching pixel `viewBox`, so fonts and
 * the line keep a CONSTANT size at any width (a fixed 380-unit viewBox stretched
 * to a wide card blew text/stroke up ~2.5×). A `ResizeObserver` (callback ref)
 * tracks the width — re-attaches correctly even when the chart appears after a
 * zero-delta state.
 *
 * **CSP-safe by construction** (SVG geometry attributes + `fill`/`stroke` +
 * a `<linearGradient>` def — never an inline `style`), zero chart lib (budget
 * 0 €, bundle 0). Colour adapts: success (gain) / danger (loss). Zero delta →
 * the chart is suppressed (neutral line).
 *
 * FSMA: pure arithmetic on the entered scenario. Both `monthlyDelta` and
 * `baseline` are `Money` passed client→client (no RSC boundary crossed).
 */

const HEIGHT = 196;
const MARGIN = { left: 48, right: 54, top: 16, bottom: 28 };
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
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

  // Measure the available width so the SVG renders at 1:1 px (no text/stroke
  // scaling). Callback ref re-attaches the observer if the node remounts.
  const [width, setWidth] = useState(640);
  const observerRef = useRef<ResizeObserver | null>(null);
  const setContainer = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    // Guard for environments without ResizeObserver (jsdom) — falls back to
    // the default width, which still renders a valid chart.
    if (node && typeof ResizeObserver !== 'undefined') {
      // Synchronous initial measure (the callback ref runs post-layout, pre-paint)
      // — avoids a flash at the default width before the observer first fires.
      const initialW = node.getBoundingClientRect().width;
      if (initialW > 0) setWidth(initialW);
      const ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w && w > 0) setWidth(w);
      });
      ro.observe(node);
      observerRef.current = ro;
    }
  }, []);

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

  const plotW = Math.max(120, width - MARGIN.left - MARGIN.right);
  const base = baseline.toNumber();
  const delta = monthlyDelta.toNumber();
  const scenario = Array.from({ length: months + 1 }, (_, k) => base + delta * k);

  const dataMin = Math.min(base, ...scenario);
  const dataMax = Math.max(base, ...scenario);
  const span = dataMax - dataMin || Math.max(1, Math.abs(base) * 0.1);
  const lo = dataMin - span * 0.55;
  const hi = dataMax + span * 0.55;

  const xAt = (i: number) => MARGIN.left + (i / months) * plotW;
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

  const yTicks = [lo, (lo + hi) / 2, hi];

  // Locale month labels (current month + k). Thin out on narrow widths.
  const now = new Date();
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  const monthLabel = (k: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const s = monthFmt.format(d).replace('.', '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const showEveryMonth = width >= 540;

  const lineColor = positive ? 'var(--color-success)' : 'var(--color-danger)';
  const ariaLabel = t('projectionAria', {
    from: fmtMoney(base),
    to: fmtMoney(scenario[months]!),
  });
  const cumulText = positive
    ? t('cumul6mGain', { amount: fmtMoney(cumul.abs()) })
    : t('cumul6mLoss', { amount: fmtMoney(cumul.abs()) });
  const endLabel = `${positive ? '+' : '−'}${fmtMoney(cumul.abs())}`;
  // Place the endpoint value to the right of the dot, or above it when the
  // right gutter is too narrow (iPhone SE / large amounts) — avoids clipping.
  const labelRoomRight = width - (endX + 10) >= endLabel.length * 7.5;
  const labelX = labelRoomRight ? endX + 9 : endX;
  const labelY = labelRoomRight ? endY + 4 : endY - 10;
  const labelAnchor = labelRoomRight ? 'start' : 'middle';

  return (
    <div
      ref={setContainer}
      className="border-border flex w-full flex-col gap-2.5 border-t pt-3"
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
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        className="block max-w-full"
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
              x2={width - MARGIN.right}
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
              fontSize="10"
              fill="var(--color-muted-foreground)"
            >
              {fmtMoney(Math.round(v))}
            </text>
          </g>
        ))}

        {/* Locale month labels. */}
        {scenario.map((_, i) =>
          showEveryMonth || i % 2 === 0 ? (
            <text
              key={`x${i}`}
              x={xAt(i)}
              y={HEIGHT - 9}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-muted-foreground)"
            >
              {monthLabel(i)}
            </text>
          ) : null,
        )}

        {/* Baseline "Sans changement" — dashed reference. */}
        <line
          x1={MARGIN.left}
          x2={width - MARGIN.right}
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
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Start dot (baseline) + endpoint halo/dot + value. */}
        <circle
          cx={xAt(0)}
          cy={baselineY}
          r="3.5"
          fill="var(--color-card)"
          stroke="var(--color-muted-foreground)"
          strokeWidth="2"
        />
        <circle cx={endX} cy={endY} r="6" fill={lineColor} fillOpacity="0.18" />
        <circle
          cx={endX}
          cy={endY}
          r="3.5"
          fill="var(--color-card)"
          stroke={lineColor}
          strokeWidth="2"
        />
        <text
          x={labelX}
          y={labelY}
          textAnchor={labelAnchor}
          fontSize="13"
          fontWeight="700"
          fill={lineColor}
        >
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
