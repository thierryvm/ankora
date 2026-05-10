'use client';

import * as React from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { SignupPoint } from '@/lib/admin';

/**
 * Signups 30-day bar chart (Section 3 Acquisition).
 * Client component — Recharts needs hooks at runtime.
 */
export function SignupsChart({
  series,
  ariaLabel,
}: {
  readonly series: ReadonlyArray<SignupPoint>;
  readonly ariaLabel: string;
}): React.JSX.Element {
  const data = series.map((p) => ({
    x: new Date(p.date).toLocaleDateString('fr-BE', { month: 'short', day: 'numeric' }),
    count: p.count,
  }));

  return (
    <div role="img" aria-label={ariaLabel} className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis
            dataKey="x"
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted-foreground)"
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted-foreground)"
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="count"
            fill="var(--color-brand-500)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
