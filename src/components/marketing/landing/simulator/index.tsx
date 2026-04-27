import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/i18n/routing';

import { SCENARIO_KEYS, type ScenarioKey } from './constants';
import { SimulatorClient, type SimulatorCopy } from './SimulatorClient';

export type SimulatorProps = {
  locale: Locale;
};

/**
 * Server Component wrapper that fetches all i18n strings and passes them as a
 * single `copy` prop to the client orchestrator. This keeps the client bundle
 * free of `next-intl` runtime dependencies and centralises locale-aware
 * formatting (the chart + result use `Intl.NumberFormat(locale, ...)`).
 *
 * Section is inserted between `<How />` and `<FAQ />` in
 * `src/app/[locale]/(public)/page.tsx` per @cowork PR-3c brief.
 */
export async function Simulator({ locale }: SimulatorProps) {
  const t = await getTranslations({ locale, namespace: 'landing.simulator' });

  const scenarios = SCENARIO_KEYS.reduce(
    (acc, key) => {
      acc[key] = {
        name: t(`scenarios.${key}.name`),
        tagline: t(`scenarios.${key}.tagline`),
        description: t(`scenarios.${key}.description`),
      };
      return acc;
    },
    {} as Record<ScenarioKey, SimulatorCopy['scenarios'][ScenarioKey]>,
  );

  const copy: SimulatorCopy = {
    scenarioGroupLabel: t('scenarios.label'),
    scenarios,
    slider: {
      label: t('slider.label'),
      valueText: t('slider.value_text'),
      unit: t('slider.unit'),
    },
    chart: {
      ariaLabel: t('chart.aria_label'),
      xAxis: t('chart.x_axis'),
      yAxis: t('chart.y_axis'),
      tooltip: t('chart.tooltip'),
      fallbackTableCaption: t('chart.fallback_table_caption'),
    },
    result: {
      title: t('result.title'),
      amountAria: t('result.amount_aria'),
      caveat: t('result.caveat'),
    },
    cta: {
      label: t('cta.label'),
      href: t('cta.href'),
    },
  };

  return (
    <section
      id="simulator"
      aria-labelledby="simulator-heading"
      className="bg-surface-soft mx-auto max-w-6xl px-4 py-16 md:px-6"
    >
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2
          id="simulator-heading"
          className="text-foreground text-3xl font-bold tracking-tight md:text-4xl"
        >
          {t('section_title')}
        </h2>
        <p className="text-muted-foreground mt-4 text-lg text-pretty">{t('section_subtitle')}</p>
      </div>

      <SimulatorClient locale={locale} copy={copy} />
    </section>
  );
}
