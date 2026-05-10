'use client';

import * as React from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { ErrorRatePoint } from '@/lib/admin';

/**
 * Error rate line chart (Section 1 Tech health).
 *
 * Recharts components require `'use client'` because they use React hooks
 * internally (ResizeObserver, refs). The Server Component parent fetches
 * the data and passes it as props — this stays a leaf Client Component.
 */
export function ErrorRateChart({
  points,
  ariaLabel,
}: {
  readonly points: ReadonlyArray<ErrorRatePoint>;
  readonly ariaLabel: string;
}): React.JSX.Element {
  const data = points.map((p) => ({
    x: new Date(p.timestamp).toLocaleString('fr-BE', {
      month: 'short',
      day: 'numeric',
      hour: points.length <= 24 ? '2-digit' : undefined,
    }),
    count: p.count,
  }));

  return (
    <div role="img" aria-label={ariaLabel} className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
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
          <Line
            type="monotone"
            dataKey="count"
            stroke="var(--color-danger)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
