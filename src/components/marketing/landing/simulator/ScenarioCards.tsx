'use client';

import * as React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { SCENARIO_KEYS, type ScenarioKey } from './constants';

export type ScenarioCopy = {
  name: string;
  tagline: string;
  description: string;
};

export type ScenarioCardsProps = {
  selected: ScenarioKey;
  onSelect: (scenario: ScenarioKey) => void;
  copy: Readonly<Record<ScenarioKey, ScenarioCopy>>;
  groupLabel: string;
};

/**
 * Three pre-set savings scenarios. The user picks one to seed the slider.
 *
 * a11y notes:
 * - Container is `role="radiogroup"` with `aria-label`.
 * - Each card is a `<button role="radio">` with `aria-checked` (radio pattern,
 *   not aria-pressed which is for toggles).
 * - Focus-visible ring uses the brand-600 token. Selected state uses an extra
 *   2px ring on the brand-700 token + bg-brand-100 for clear visual contrast
 *   (≥ 4.5:1 against text-brand-900).
 */
export function ScenarioCards({ selected, onSelect, copy, groupLabel }: ScenarioCardsProps) {
  return (
    <div role="radiogroup" aria-label={groupLabel} className="grid gap-4 md:grid-cols-3">
      {SCENARIO_KEYS.map((key) => {
        const isSelected = key === selected;
        const scenarioCopy = copy[key];
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(key)}
            className={cn(
              'focus-visible:ring-brand-600 rounded-xl text-left transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              isSelected ? 'ring-brand-700 ring-2' : 'ring-0',
            )}
          >
            <Card
              className={cn('h-full', isSelected ? 'bg-brand-100 border-brand-500' : 'bg-card')}
            >
              <CardHeader>
                <CardTitle className={isSelected ? 'text-brand-900' : 'text-foreground'}>
                  {scenarioCopy.name}
                </CardTitle>
                <CardDescription
                  className={isSelected ? 'text-brand-800' : 'text-muted-foreground'}
                >
                  {scenarioCopy.tagline}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className={cn('text-sm', isSelected ? 'text-brand-900' : 'text-foreground')}>
                  {scenarioCopy.description}
                </p>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
