import * as React from 'react';

/**
 * Atom 05 — ProgressBar (Claude Design Session #3)
 *
 * Linéaire. value/max + auto-tone (warning > 0.85, danger > 1.0 overflow),
 * sizes sm/md/lg (h 6/8/12 px), optional label/value/cap/sub.
 *
 * Mode `split` : affiche deux segments (affected + free) pour pattern
 * Reste disponible / provisions / budget enveloppe (ADR-002 split-aware).
 *
 * Server Component compatible — pas de `'use client'` (purement présentationnel).
 *
 * Source: design_handoff_ankora_v1/atoms/05-ProgressBar.jsx
 */

export type ProgressBarTone = 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
export type ProgressBarSize = 'sm' | 'md' | 'lg';

export interface ProgressBarSplit {
  readonly affected: number;
  readonly free: number;
  readonly affectedTone?: ProgressBarTone;
  readonly freeTone?: ProgressBarTone;
}

export interface ProgressBarProps {
  readonly value: number;
  readonly max?: number;
  readonly tone?: ProgressBarTone;
  readonly size?: ProgressBarSize;
  readonly label?: string;
  readonly valueLabel?: string;
  readonly sub?: string;
  readonly showValue?: boolean;
  readonly showCap?: boolean;
  readonly split?: ProgressBarSplit;
}

const HEIGHT_BY_SIZE: Readonly<Record<ProgressBarSize, number>> = {
  sm: 6,
  md: 8,
  lg: 12,
};

export function ProgressBar({
  value,
  max = 1,
  tone,
  size = 'md',
  label,
  valueLabel,
  sub,
  showValue = false,
  showCap = false,
  split,
}: ProgressBarProps): React.JSX.Element {
  const ratio = value / max;
  const pct = Math.max(0, Math.min(1, ratio));
  const overflow = ratio > 1;
  const auto: ProgressBarTone = overflow ? 'danger' : pct > 0.85 ? 'warning' : 'brand';
  const finalTone: ProgressBarTone = tone ?? auto;
  const h = HEIGHT_BY_SIZE[size];

  const ariaValueNow = Math.round(pct * 100);
  const ariaLabel = label ?? 'Progression';

  return (
    <div className="atm-pbar-wrap">
      {(label || showValue) && (
        <div className="atm-pbar-head">
          {label && <span className="atm-pbar-label">{label}</span>}
          {showValue && (
            <span className="atm-pbar-value">{valueLabel ?? `${Math.round(pct * 100)}%`}</span>
          )}
        </div>
      )}
      <div
        className="atm-pbar"
        style={{ height: h }}
        role="progressbar"
        aria-valuenow={ariaValueNow}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
      >
        {split ? (
          <>
            <div
              className={`atm-pbar-fill atm-pbar--${split.affectedTone ?? 'brand'}`}
              style={{ width: `${Math.min(100, (split.affected / max) * 100)}%` }}
            />
            <div
              className={`atm-pbar-fill atm-pbar--${split.freeTone ?? 'accent'}`}
              style={{ width: `${Math.min(100, (split.free / max) * 100)}%` }}
            />
          </>
        ) : (
          <div
            className={`atm-pbar-fill atm-pbar--${finalTone}`}
            style={{ width: `${Math.min(100, pct * 100)}%` }}
          />
        )}
        {showCap && <div className="atm-pbar-cap" aria-hidden="true" />}
      </div>
      {sub && <div className="atm-pbar-sub">{sub}</div>}
    </div>
  );
}
