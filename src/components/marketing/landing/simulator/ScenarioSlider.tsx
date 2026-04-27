'use client';

import * as React from 'react';

import { SLIDER_RANGE } from './constants';

export type ScenarioSliderProps = {
  value: number;
  onChange: (value: number) => void;
  label: string;
  /** ICU template like "{amount} euros par mois" — `{amount}` is replaced. */
  valueText: string;
  unit: string;
};

/**
 * Native `<input type="range">` styled with Tailwind. Native is the right
 * choice here:
 * - Free a11y (keyboard arrows, screen reader value announcement).
 * - Zero JS for the drag interaction.
 * - Works without hydration (graceful degradation).
 *
 * The visual numeric value is rendered in a sibling `<span>` next to the label
 * so sighted users see the live amount; `aria-valuetext` provides the
 * spoken-language equivalent (e.g. "100 euros par mois") for screen readers.
 */
export function ScenarioSlider({ value, onChange, label, valueText, unit }: ScenarioSliderProps) {
  const sliderId = React.useId();
  const announcedText = valueText.replace('{amount}', String(value));

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={sliderId} className="text-foreground text-sm font-medium">
          {label}
        </label>
        <span className="text-foreground text-lg font-semibold tabular-nums" aria-hidden="true">
          {value} {unit}
        </span>
      </div>
      <input
        id={sliderId}
        type="range"
        min={SLIDER_RANGE.min}
        max={SLIDER_RANGE.max}
        step={SLIDER_RANGE.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={announcedText}
        className="bg-surface-muted accent-brand-700 focus-visible:ring-brand-600 h-2 w-full cursor-pointer appearance-none rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      />
    </div>
  );
}
