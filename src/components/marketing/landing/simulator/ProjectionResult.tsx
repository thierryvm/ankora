'use client';

import * as React from 'react';

import { money, type Money } from '@/lib/domain/types';
import { projectCumulative } from '@/lib/domain/simulation';

import { PROJECTION_MONTHS } from './constants';

export type ProjectionResultProps = {
  /** Monthly amount set aside, in EUR (integer or decimal-string). */
  monthlyAmount: number;
  locale: string;
  copy: {
    title: string;
    /** ICU template "{amount}" — replaced with formatted EUR. */
    amountAria: string;
    caveat: string;
  };
};

/**
 * Final 12-month projected total, formatted with `Intl.NumberFormat` honouring
 * the active locale (fr-BE / en / nl-BE / de-DE / es-ES).
 *
 * The amount is computed via `projectCumulative` from the domain layer so the
 * math is the same as everywhere else in the app and stays covered by the
 * Phase T1 fast-check property tests.
 *
 * FSMA-safe copy: the caveat is mandatory and explicitly states Ankora does
 * not provide investment advice.
 */
export function ProjectionResult({ monthlyAmount, locale, copy }: ProjectionResultProps) {
  const total: Money = projectCumulative(money(monthlyAmount), PROJECTION_MONTHS);

  const formatter = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }),
    [locale],
  );

  const formatted = formatter.format(total.toNumber());
  const ariaLabel = copy.amountAria.replace('{amount}', formatted);

  return (
    <div className="border-border bg-surface-muted rounded-xl border p-6 text-center">
      <p className="text-muted-foreground text-sm font-medium">{copy.title}</p>
      <p
        className="text-brand-900 mt-2 text-4xl font-bold tabular-nums md:text-5xl"
        aria-label={ariaLabel}
      >
        {formatted}
      </p>
      <p className="text-muted-foreground mx-auto mt-4 max-w-md text-xs">{copy.caveat}</p>
    </div>
  );
}
