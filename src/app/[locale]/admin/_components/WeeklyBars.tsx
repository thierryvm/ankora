import * as React from 'react';

import type { SmallCount, WeeklySignups } from '@/lib/admin/aggregates';

/**
 * A small bar chart, one bar per week, in plain SVG (no chart library, like
 * `RythmeDuMois`). The picture is decorative for assistive technology: the
 * same figures sit in a visually hidden table right after it, which is what a
 * screen reader reads.
 *
 * A masked week (`'< 5'`) draws a short dashed bar and says « < 5 » above it,
 * as is: its height is not a measure, only a sign that the week is not empty.
 */

const WIDTH = 360;
const HEIGHT = 150;
const TOP = 18;
const AXIS = 24;
const GAP = 6;
/** Height of a masked bar, as a share of the plot. Not a value. */
const MASKED_SHARE = 0.12;

export function shownCount(value: SmallCount, masked: string): string {
  return value === 'hidden' ? masked : String(value);
}

export function WeeklyBars({
  weeks,
  caption,
  weekHeader,
  countHeader,
  masked,
  formatWeek,
}: Readonly<{
  weeks: ReadonlyArray<WeeklySignups>;
  caption: string;
  weekHeader: string;
  countHeader: string;
  masked: string;
  formatWeek: (week: string) => string;
}>): React.JSX.Element {
  const plot = HEIGHT - TOP - AXIS;
  const numbers = weeks.map((w) => (typeof w.signups === 'number' ? w.signups : 0));
  const max = Math.max(5, ...numbers);
  const slot = WIDTH / Math.max(1, weeks.length);
  const bar = slot - GAP;

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        aria-hidden="true"
        focusable="false"
      >
        <line
          x1={0}
          x2={WIDTH}
          y1={TOP + plot}
          y2={TOP + plot}
          className="stroke-border"
          strokeWidth={1}
        />
        {weeks.map((w, i) => {
          const x = i * slot + GAP / 2;
          const isMasked = w.signups === '< 5';
          const height =
            typeof w.signups === 'number'
              ? (w.signups / max) * plot
              : isMasked
                ? MASKED_SHARE * plot
                : 0;
          const y = TOP + plot - height;
          // Every third week from the last carries its date: twelve labels do
          // not fit side by side on a phone.
          const labelled = (weeks.length - 1 - i) % 3 === 0;
          return (
            <g key={w.week}>
              {height > 0 ? (
                <rect
                  x={x}
                  y={y}
                  width={bar}
                  height={height}
                  rx={2}
                  className={
                    isMasked
                      ? 'fill-accent-text/25 stroke-accent-text'
                      : 'fill-accent-text stroke-none'
                  }
                  strokeDasharray={isMasked ? '3 2' : undefined}
                  strokeWidth={isMasked ? 1 : 0}
                />
              ) : null}
              <text
                x={x + bar / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize={12}
                className="fill-muted-foreground tabular-nums"
              >
                {shownCount(w.signups, masked)}
              </text>
              {labelled ? (
                <text
                  x={x + bar / 2}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  fontSize={13}
                  className="fill-muted-foreground"
                >
                  {formatWeek(w.week)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{weekHeader}</th>
            <th scope="col">{countHeader}</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <th scope="row">{formatWeek(w.week)}</th>
              <td>{shownCount(w.signups, masked)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
