import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Linear progress bar.
 *
 * Ported from the deleted `atoms/ProgressBar.tsx` (ADR-034), reduced to the
 * API that production actually consumes. The `split`, `sub`, `valueLabel` and
 * `showCap` modes had zero call-sites and were not carried over — the split
 * mode in particular existed for the "reste disponible / budget enveloppe"
 * pattern that ADR-035 removes.
 *
 * CSP-safe (THI-322) — non-negotiable, kept verbatim from the original: the
 * fill width NEVER goes through an inline `style={{…}}`, which the strict
 * `style-src 'self' 'nonce-…'` policy blocks. The fill is an SVG `<rect>`
 * whose geometry (`width`) is expressed in viewBox units (0..100), and the
 * bar height is driven by a size class rather than an inline style.
 *
 * Server Component compatible — no `'use client'` (purely presentational).
 */

export type ProgressTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
export type ProgressSize = 'sm' | 'md' | 'lg';

export interface ProgressProps {
  readonly value: number;
  readonly max?: number;
  readonly tone?: ProgressTone;
  readonly size?: ProgressSize;
  readonly label?: string;
  readonly showValue?: boolean;
}

/** viewBox height per size — must match the rendered height class below. */
const VIEWBOX_HEIGHT: Readonly<Record<ProgressSize, number>> = {
  sm: 6,
  md: 8,
  lg: 12,
};

const HEIGHT_CLASS: Readonly<Record<ProgressSize, string>> = {
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
};

const FILL_CLASS: Readonly<Record<ProgressTone, string>> = {
  brand: 'fill-brand-500',
  success: 'fill-success',
  warning: 'fill-warning',
  danger: 'fill-danger',
  neutral: 'fill-muted',
};

export function Progress({
  value,
  max = 1,
  tone,
  size = 'md',
  label,
  showValue = false,
}: ProgressProps): React.JSX.Element {
  const ratio = value / max;
  const pct = Math.max(0, Math.min(1, ratio));
  const overflow = ratio > 1;
  const autoTone: ProgressTone = overflow ? 'danger' : pct > 0.85 ? 'warning' : 'brand';
  const finalTone: ProgressTone = tone ?? autoTone;
  const h = VIEWBOX_HEIGHT[size];

  const percent = Math.round(pct * 100);

  return (
    <div className="flex flex-col gap-1">
      {(label || showValue) && (
        <div className="flex items-baseline justify-between text-xs">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showValue && <span className="text-foreground tabular-nums">{percent}%</span>}
        </div>
      )}
      <div
        className={cn(
          'bg-surface-muted relative flex overflow-hidden rounded-full',
          HEIGHT_CLASS[size],
        )}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progression'}
      >
        <svg
          className="block h-full w-full"
          viewBox={`0 0 100 ${h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect className={FILL_CLASS[finalTone]} x={0} y={0} width={pct * 100} height={h} />
        </svg>
      </div>
    </div>
  );
}
