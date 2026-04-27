'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { money } from '@/lib/domain/types';
import { projectCumulative } from '@/lib/domain/simulation';

import { PROJECTION_MONTHS } from './constants';

export type ProjectionChartProps = {
  /** Monthly amount set aside, in EUR. */
  monthlyAmount: number;
  locale: string;
  copy: {
    ariaLabel: string;
    xAxis: string;
    yAxis: string;
    /** ICU template "Mois {month} : {amount}". */
    tooltip: string;
    /** Fallback table caption for screen readers. */
    fallbackTableCaption: string;
  };
};

type ChartDatum = {
  month: number;
  cumulative: number;
};

function buildSeries(monthlyAmount: number): ChartDatum[] {
  const monthly = money(monthlyAmount);
  return Array.from({ length: PROJECTION_MONTHS }, (_, i) => {
    const month = i + 1;
    return {
      month,
      cumulative: projectCumulative(monthly, month).toNumber(),
    };
  });
}

/**
 * 12-month cumulative-savings AreaChart.
 *
 * a11y strategy:
 * - Recharts is notoriously hard to make screen-reader friendly. We rely on
 *   `aria-label` on the wrapper + a visually-hidden `<table>` mirror that
 *   exposes the same data points to assistive tech.
 * - Colours come from CSS custom properties (--color-brand-*) so contrast
 *   stays in sync with the design system tokens — no hardcoded hex.
 */
export function ProjectionChart({ monthlyAmount, locale, copy }: ProjectionChartProps) {
  const data = React.useMemo(() => buildSeries(monthlyAmount), [monthlyAmount]);
  const formatter = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }),
    [locale],
  );

  return (
    <figure aria-label={copy.ariaLabel} className="w-full">
      <div className="h-64 w-full md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ankora-projection-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
              tickLine={{ stroke: 'var(--color-border)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
              label={{
                value: copy.xAxis,
                position: 'insideBottom',
                offset: -2,
                fill: 'var(--color-muted-foreground)',
                fontSize: 12,
              }}
            />
            <YAxis
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
              tickLine={{ stroke: 'var(--color-border)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickFormatter={(value: number) => formatter.format(value)}
              width={70}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: '0.5rem',
                color: 'var(--color-foreground)',
              }}
              labelStyle={{ color: 'var(--color-muted-foreground)' }}
              formatter={(value, _name, item) => {
                const amount = typeof value === 'number' ? value : Number(value);
                const monthValue =
                  item && typeof item === 'object' && 'payload' in item
                    ? (item.payload as ChartDatum).month
                    : 0;
                return [
                  copy.tooltip
                    .replace('{month}', String(monthValue))
                    .replace('{amount}', formatter.format(amount)),
                  '',
                ];
              }}
              labelFormatter={() => ''}
              separator=""
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="var(--color-brand-700)"
              strokeWidth={2}
              fill="url(#ankora-projection-gradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>{copy.fallbackTableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{copy.xAxis}</th>
            <th scope="col">{copy.yAxis}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.month}</th>
              <td>{formatter.format(d.cumulative)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
