'use client';

import * as React from 'react';

/**
 * Curated CD#3 palette — 12 colors covering category needs.
 * Source: design_handoff_ankora_v1/atoms/07-ColorPicker.jsx
 */
export const ATM_COLOR_PALETTE: readonly string[] = [
  '#2dd4bf',
  '#10b981',
  '#60a5fa',
  '#3b82f6',
  '#a78bfa',
  '#c084fc',
  '#f87171',
  '#fb7185',
  '#facc15',
  '#fb923c',
  '#22d3ee',
  '#94a3b8',
];

export interface ColorPickerProps {
  readonly value: string;
  readonly options?: readonly string[];
  readonly onChange: (color: string) => void;
  readonly columns?: number;
  readonly className?: string;
  readonly ariaLabel?: string;
}

/**
 * Atom 07 — ColorPicker
 *
 * Radiogroup palette de swatches. Pas de free picker (cohérence design system).
 * Consommé par Drawer category field. Roving tabIndex (active = 0, inactive = -1).
 */
export function ColorPicker({
  value,
  options = ATM_COLOR_PALETTE,
  onChange,
  columns = 6,
  className,
  ariaLabel = 'Choisir une couleur',
}: ColorPickerProps): React.JSX.Element {
  const classes = ['atm-cpick', className ?? ''].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {options.map((color) => {
        const isActive = color === value;
        const swatchClass = 'atm-cpick-swatch' + (isActive ? ' is-active' : '');
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`Couleur ${color}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => {
              onChange(color);
            }}
            className={swatchClass}
            style={{ backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}
