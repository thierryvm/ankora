import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Row — horizontal flex container with configurable gap / alignment.
 *
 * Mirrors the cc-design `.row` utility (`shell.css` line 206): the same idea
 * as `<div className="flex items-center gap-3">` but with a typed React API
 * to keep landing/onboarding/cockpit JSX terser and consistent.
 *
 * Defaults match cc-design (`align: center`, `gap: 3` ≈ 12px) so dropping
 * a `<Row>{...children}</Row>` reproduces the source mockup spacing without
 * extra props.
 */

export type RowGap = 1 | 2 | 3 | 4 | 5 | 6 | 8;
export type RowAlign = 'start' | 'center' | 'end' | 'baseline' | 'stretch';
export type RowJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

const GAP_CLASS: Readonly<Record<RowGap, string>> = {
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
};

const ALIGN_CLASS: Readonly<Record<RowAlign, string>> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  baseline: 'items-baseline',
  stretch: 'items-stretch',
};

const JUSTIFY_CLASS: Readonly<Record<RowJustify, string>> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

export type RowProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Tailwind gap step. Defaults to 3 (≈ 12px, matches cc-design). */
  gap?: RowGap;
  /** Cross-axis alignment. Defaults to 'center' (matches cc-design). */
  align?: RowAlign;
  /** Main-axis distribution. Defaults to 'start'. */
  justify?: RowJustify;
};

export const Row = React.forwardRef<HTMLDivElement, RowProps>(
  ({ className, gap = 3, align = 'center', justify = 'start', ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex', GAP_CLASS[gap], ALIGN_CLASS[align], JUSTIFY_CLASS[justify], className)}
      {...props}
    />
  ),
);
Row.displayName = 'Row';
