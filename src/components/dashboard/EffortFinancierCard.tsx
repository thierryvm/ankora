import { ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  effortFinancierLisse,
  provisionsMensuellesLissees,
  totalChargesMensuelles,
} from '@/lib/domain/cockpit';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';

type Props = {
  charges: readonly CockpitCharge[];
  locale: Locale;
};

/**
 * Effort Financier Lissé — radar card #1 of cockpit Bloc 2 (ADR-009).
 *
 * Big number = `totalChargesMensuelles + provisionsMensuellesLissees`. The
 * breakdown reveals the two contributors so the user can recognise that
 * a "calm month" with no annual bill due is not a green light to spend
 * the apparent surplus — the lissage already earmarked it.
 *
 * Visually: subtle navy gradient + brass shield top-right + tabular numerics.
 * Server Component (zero hydration cost — pure math + i18n).
 */
export async function EffortFinancierCard({ charges, locale }: Props) {
  const t = await getTranslations('dashboard.effort');
  const fixedCharges = totalChargesMensuelles(charges);
  const provisions = provisionsMensuellesLissees(charges);
  const total = effortFinancierLisse(charges);
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  return (
    <Card
      className="relative overflow-hidden ring-1 ring-blue-500/15 ring-inset"
      data-testid="effort-financier-card"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/8 to-transparent"
      />
      <CardHeader className="relative flex flex-row items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-muted-foreground text-sm font-medium">{t('title')}</CardTitle>
        </div>
        <ShieldCheck aria-hidden strokeWidth={1.5} className="h-6 w-6 shrink-0 text-blue-500" />
      </CardHeader>
      <CardContent className="relative">
        <p
          className="text-foreground text-4xl font-bold tracking-tight tabular-nums"
          data-testid="effort-financier-total"
        >
          {fmt(total)}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-muted-foreground">{t('charges_fixes')}</dt>
            <dd className="text-foreground mt-0.5 font-semibold tabular-nums">
              {fmt(fixedCharges)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('provisions')}</dt>
            <dd className="text-foreground mt-0.5 font-semibold tabular-nums">
              {provisions.gt(0) ? '+' : ''}
              {fmt(provisions)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
