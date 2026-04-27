'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';

import { DEFAULT_SCENARIO, SCENARIO_DELTAS, type ScenarioKey } from './constants';
import { ProjectionChart, type ProjectionChartProps } from './ProjectionChart';
import { ProjectionResult, type ProjectionResultProps } from './ProjectionResult';
import { ScenarioCards, type ScenarioCardsProps, type ScenarioCopy } from './ScenarioCards';
import { ScenarioSlider, type ScenarioSliderProps } from './ScenarioSlider';

export type SimulatorCopy = {
  scenarioGroupLabel: string;
  scenarios: Readonly<Record<ScenarioKey, ScenarioCopy>>;
  slider: {
    label: ScenarioSliderProps['label'];
    valueText: ScenarioSliderProps['valueText'];
    unit: ScenarioSliderProps['unit'];
  };
  chart: ProjectionChartProps['copy'];
  result: ProjectionResultProps['copy'];
  cta: {
    label: string;
    href: string;
  };
};

export type SimulatorClientProps = {
  locale: string;
  copy: SimulatorCopy;
};

/**
 * Orchestrates the four sub-components:
 *
 * 1. `<ScenarioCards>` — picks a preset (steady / balanced / ambitious).
 * 2. `<ScenarioSlider>` — overrides the preset with a custom monthly amount.
 * 3. `<ProjectionChart>` — recharts AreaChart of the 12-month cumulative.
 * 4. `<ProjectionResult>` — final 12-month total formatted in the user's locale.
 *
 * Switching scenarios resets the slider to that scenario's delta. Moving the
 * slider keeps the scenario-card visual selection but overrides the value.
 */
export function SimulatorClient({ locale, copy }: SimulatorClientProps) {
  const [selectedScenario, setSelectedScenario] = React.useState<ScenarioKey>(DEFAULT_SCENARIO);
  const [monthlyAmount, setMonthlyAmount] = React.useState<number>(
    SCENARIO_DELTAS[DEFAULT_SCENARIO],
  );

  const handleScenarioSelect: ScenarioCardsProps['onSelect'] = (scenario) => {
    setSelectedScenario(scenario);
    setMonthlyAmount(SCENARIO_DELTAS[scenario]);
  };

  return (
    <div className="space-y-8">
      <ScenarioCards
        selected={selectedScenario}
        onSelect={handleScenarioSelect}
        copy={copy.scenarios}
        groupLabel={copy.scenarioGroupLabel}
      />

      <ScenarioSlider
        value={monthlyAmount}
        onChange={setMonthlyAmount}
        label={copy.slider.label}
        valueText={copy.slider.valueText}
        unit={copy.slider.unit}
      />

      <ProjectionChart monthlyAmount={monthlyAmount} locale={locale} copy={copy.chart} />

      <ProjectionResult monthlyAmount={monthlyAmount} locale={locale} copy={copy.result} />

      <div className="flex justify-center">
        <Button asChild size="lg">
          <a href={copy.cta.href}>{copy.cta.label}</a>
        </Button>
      </div>
    </div>
  );
}
