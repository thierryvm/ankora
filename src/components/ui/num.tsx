import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Num — tabular monetary / metric figure.
 *
 * Wraps the `.num`, `.num-lg`, `.num-md` classes (`globals.css` ~lines 273-292)
 * which apply `--font-mono` + `font-variant-numeric: tabular-nums` so figures
 * align across rows in dashboards and KPI cards.
 *
 * Sizes mirror the design-system type scale:
 *   - `xl` → `--text-num-xl` (700 / 2rem)
 *   - `lg` → `--text-num-lg` (600 / 1.375rem)
 *   - `md` → `--text-num-md` (500 / 1rem)
 *   - `sm` → no preset class; falls back to `--font-mono` + `tabular-nums` only
 *
 * Tone:
 *   - `default` → `--color-foreground`
 *   - `accent`  → `--color-brand-text-strong` via `.num-accent`
 */

export type NumSize = 'sm' | 'md' | 'lg' | 'xl';
export type NumTone = 'default' | 'accent';

const SIZE_CLASS: Readonly<Record<NumSize, string>> = {
  sm: 'font-mono tabular-nums text-foreground text-sm',
  md: 'num-md',
  lg: 'num-lg',
  xl: 'num-xl',
};

export type NumProps = React.HTMLAttributes<HTMLSpanElement> & {
  /** Visual size. Defaults to 'md' (1rem). */
  size?: NumSize;
  /** Tone variant. Defaults to 'default' (foreground colour). */
  tone?: NumTone;
};

export const Num = React.forwardRef<HTMLSpanElement, NumProps>(
  ({ className, size = 'md', tone = 'default', children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(SIZE_CLASS[size], tone === 'accent' && 'num-accent', className)}
      {...props}
    >
      {children}
    </span>
  ),
);
Num.displayName = 'Num';
