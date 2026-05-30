'use client';

import { useTranslations } from 'next-intl';

import { Simulation, type Money } from '@/lib/domain';
import type { formatCurrency } from '@/lib/i18n/formatters';

/**
 * SimulatorProjection — 6-month "réserve libre" projection inside the simulator
 * Impact card (Track B P1 lot 1, model locked 2026-05-30: "cumul marginal").
 *
 * - S3: a light inline SVG sparkline. Two reads — a flat **0 baseline** ("Sans
 *   changement") and the **scenario line** = `monthlyDelta × month` ("Avec ce
 *   choix"). The growing gap IS the cumulative saving. No hardcoded absolute
 *   baseline (the landing's `RESERVE_BASELINE_6M` is fabricated demo data and
 *   stays out of the authenticated cockpit).
 * - S4: a human cumul sentence — "En 6 mois, +X € en réserve libre".
 *
 * FSMA: pure arithmetic on the entered scenario, zero behavioural assumption
 * (we never claim the user banks their broader réserve). RSC boundary: this is
 * a `'use client'` leaf; `cumulativeReserveSeries` runs in the browser from a
 * `monthlyDelta` already client-side — no `Money`/`Decimal` is serialised.
 *
 * When `monthlyDelta` is zero (e.g. negotiating to the same amount) there is
 * nothing to plot, so the sparkline is suppressed and a neutral line is shown —
 * the hero already surfaces the unchanged "X → X /mois".
 */

// Compact, mobile-first sparkline geometry (viewBox units, scales with width).
const VIEW_W = 240;
const VIEW_H = 64;
const PAD = 6;
const DEFAULT_MONTHS = 6;

export function SimulatorProjection({
  monthlyDelta,
  fmtMoney,
  months = DEFAULT_MONTHS,
}: {
  monthlyDelta: Money;
  /**
   * Locale-aware currency formatter from the parent. Typed off `formatCurrency`
   * so it accepts `Money | number` (plan-reviewer note 1) — passing a function
   * client→client crosses no RSC boundary.
   */
  fmtMoney: (value: Parameters<typeof formatCurrency>[0]) => string;
  months?: number;
}) {
  const t = useTranslations('app.simulator.impact');

  const isZero = monthlyDelta.isZero();
  const positive = monthlyDelta.gt(0);
  const cumul = Simulation.projectCumulative(monthlyDelta, months);

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

  // Real cumulative values (Money), then `.toNumber()` ONLY for pixel geometry —
  // every displayed amount still goes through `fmtMoney(Money)`.
  const series = Simulation.cumulativeReserveSeries(monthlyDelta, months);
  // Prepend a 0 origin so both lines start together at month 0 and visibly
  // diverge — matches the "de 0 € à {to}" narrative read to screen readers.
  const points = [0, ...series.map((m) => m.toNumber())];
  const end = points[points.length - 1]!;

  const lo = Math.min(0, end);
  const hi = Math.max(0, end);
  const range = hi - lo; // > 0 here (isZero short-circuited above)
  const plotW = VIEW_W - PAD * 2;
  const plotH = VIEW_H - PAD * 2;

  const xAt = (i: number) => PAD + (i / (points.length - 1)) * plotW;
  const yAt = (v: number) => {
    // Defensive: a degenerate [0,0] domain would yield NaN (plan-reviewer
    // point 3). Unreachable while `isZero` short-circuits, kept for safety.
    if (range === 0) return PAD + plotH / 2;
    return PAD + plotH - ((v - lo) / range) * plotH;
  };

  const baselineY = yAt(0);
  const scenarioPath = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
    .join(' ');
  const areaPath =
    `${scenarioPath} L ${xAt(points.length - 1).toFixed(1)} ${baselineY.toFixed(1)}` +
    ` L ${xAt(0).toFixed(1)} ${baselineY.toFixed(1)} Z`;

  const lineColor = positive ? 'var(--color-success)' : 'var(--color-danger)';
  const ariaLabel = t('projectionAria', { from: fmtMoney(0), to: fmtMoney(cumul) });
  const cumulText = positive
    ? t('cumul6mGain', { amount: fmtMoney(cumul.abs()) })
    : t('cumul6mLoss', { amount: fmtMoney(cumul.abs()) });

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
              width="10"
              height="2"
              className="text-muted-foreground inline-block"
            >
              <line
                x1="0"
                y1="1"
                x2="10"
                y2="1"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
            </svg>
            <span className="text-muted-foreground">{t('projectionBaselineLegend')}</span>
          </li>
          <li className="flex items-center gap-1.5">
            {/* The swatch (graphical object, WCAG 1.4.11 → 3:1) carries the
                scenario colour; the LABEL stays muted-foreground so the small
                text meets 4.5:1 in both themes (success #059669 is sub-AA for
                small text on the light card; danger #dc2626 on the dark card). */}
            <svg
              aria-hidden="true"
              width="10"
              height="2"
              className={`inline-block ${positive ? 'text-success' : 'text-danger'}`}
            >
              <line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="2" />
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
        {/* Flat 0 baseline — "Sans changement". */}
        <line
          x1={xAt(0)}
          x2={xAt(points.length - 1)}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--color-muted-foreground)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeOpacity="0.6"
        />
        {/* Scenario area + line — "Avec ce choix". */}
        <path d={areaPath} fill={lineColor} fillOpacity="0.12" />
        <path
          d={scenarioPath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* End marker. */}
        <circle
          cx={xAt(points.length - 1)}
          cy={yAt(end)}
          r="2.5"
          fill="var(--color-card)"
          stroke={lineColor}
          strokeWidth="2"
        />
      </svg>

      {/* Cumul sentence in `text-foreground` (AAA both themes) — the gain/loss
          colour lives in the sparkline (large graphical, ≥3:1). Colouring this
          small text success/danger would breach 4.5:1 (see legend note). */}
      <p
        className="text-foreground text-sm font-medium tabular-nums"
        data-testid="simulator-cumul6m"
      >
        {cumulText}
      </p>
    </div>
  );
}
