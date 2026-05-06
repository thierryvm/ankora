import Decimal from 'decimal.js';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { capaciteEpargneReelle } from '@/lib/domain/cockpit';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';

type Props = {
  revenus: Decimal;
  charges: readonly CockpitCharge[];
  plafondQuotidien: Decimal;
  locale: Locale;
};

/**
 * Capacité d'Épargne Réelle — radar card #2 of cockpit Bloc 2 (ADR-009).
 *
 * THE differentiating KPI: `revenus - effortFinancierLisse - plafondQuotidien`.
 * Stable mois-après-mois (the lissage absorbs the volatility of periodic
 * bills) and honest about whether the user's lifestyle fits inside their
 * income on a true annual basis. No competitor (Monarch, YNAB, Lunch Money,
 * Linxo, Bankin') ships this calculation.
 *
 * PR-D3-bis pedagogy update — the bare big number that PR-D3 shipped was
 * opaque to anyone but @thierry: "+124 €" with no audit trail. We now
 * always show the waterfall breakdown above the big number so a new user
 * understands the calculation at first glance:
 *
 *     Revenus            2 500 €
 *   − Effort lissé     −1 876 €
 *   − Plafond quotidien  −500 €
 *   ────────────────────────
 *   Capacité réelle    +124 € ✓
 *
 * Visual semantics:
 *  - emerald accent + CheckCircle2 + positive message when capacité ≥ 0
 *  - rose accent + AlertCircle + warning message when capacité < 0
 *  - decorative glow blob bottom-right matching the state colour
 *
 * Server Component (math + i18n only).
 */
export async function CapaciteEpargneCard({ revenus, charges, plafondQuotidien, locale }: Props) {
  const t = await getTranslations('dashboard.capacite');
  const result = capaciteEpargneReelle({ revenus, charges, plafondQuotidien });
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  const accent = result.isPositive
    ? {
        ringColor: 'ring-emerald-500/15',
        iconColor: 'text-emerald-500',
        valueColor: 'text-emerald-600 dark:text-emerald-400',
        glowColor: 'bg-emerald-500/20',
        gradientFrom: 'from-emerald-500/8',
        Icon: CheckCircle2,
        message: t('message_positive'),
      }
    : {
        ringColor: 'ring-rose-500/15',
        iconColor: 'text-rose-500',
        valueColor: 'text-rose-600 dark:text-rose-400',
        glowColor: 'bg-rose-500/20',
        gradientFrom: 'from-rose-500/8',
        Icon: AlertCircle,
        message: t('message_negative'),
      };

  // Force "+12,34 €" prefix on positive values so the affirmative framing is
  // unambiguous; the formatter omits the sign for non-negative numbers by
  // default. Zero stays unsigned (still positive per `isPositive`).
  const formatted = fmt(result.capacite);
  const signed = result.capacite.gt(0) ? `+${formatted}` : formatted;

  // The waterfall row data — order matches the ADR-009 formula left-to-right
  // so the math is reconstructible by a reader who has never seen the app.
  const showPlafondRow = plafondQuotidien.gt(0);
  const breakdownRows: Array<{
    key: string;
    label: string;
    value: string;
    operator: '+' | '−';
  }> = [
    { key: 'revenus', label: t('breakdown.revenus'), value: fmt(revenus), operator: '+' },
    {
      key: 'effort',
      label: t('breakdown.effort'),
      value: fmt(result.effortFinancierLisse),
      operator: '−',
    },
  ];
  if (showPlafondRow) {
    breakdownRows.push({
      key: 'plafond',
      label: t('breakdown.plafond'),
      value: fmt(plafondQuotidien),
      operator: '−',
    });
  }

  return (
    <Card
      className={`relative overflow-hidden ring-1 ring-inset ${accent.ringColor}`}
      data-testid="capacite-epargne-card"
      data-positive={result.isPositive ? 'true' : 'false'}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-linear-to-br ${accent.gradientFrom} to-transparent`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-16 -bottom-16 h-48 w-48 rounded-full ${accent.glowColor} opacity-70 blur-3xl`}
      />
      <CardHeader className="relative flex flex-row items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-muted-foreground text-sm font-medium">{t('title')}</CardTitle>
        </div>
        <accent.Icon
          aria-hidden
          strokeWidth={1.5}
          className={`h-6 w-6 shrink-0 ${accent.iconColor}`}
        />
      </CardHeader>
      <CardContent className="relative">
        <dl
          className="text-muted-foreground mb-3 flex flex-col gap-1.5 text-sm"
          data-testid="capacite-epargne-breakdown"
        >
          {breakdownRows.map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-3">
              <dt className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="text-muted-foreground/70 inline-flex w-4 justify-center font-medium"
                >
                  {row.operator}
                </span>
                <span>{row.label}</span>
              </dt>
              <dd className="text-foreground/80 font-medium tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-border/60 border-t pt-3">
          <p
            className={`text-4xl font-bold tracking-tight tabular-nums ${accent.valueColor}`}
            data-testid="capacite-epargne-value"
          >
            {signed}
          </p>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{accent.message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
