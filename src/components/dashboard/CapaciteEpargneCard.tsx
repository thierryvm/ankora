import Decimal from 'decimal.js';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { capaciteEpargneReelle } from '@/lib/domain/cockpit';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';
import { AjusterResteAVivreDrawer } from './AjusterResteAVivreDrawer';

type Props = {
  revenus: Decimal;
  charges: readonly CockpitCharge[];
  resteAVivre: Decimal;
  /** ISO `YYYY-MM` for the current month — drives the drawer override key. */
  currentMonthYYYYMM: string;
  locale: Locale;
};

/**
 * Capacité d'Épargne Réelle — Bloc 2 hero radar #2 (ADR-009 + amendement
 * 2026-05-09 — tryptique pédagogique).
 *
 * THE differentiating KPI of Ankora: `revenus − effortFinancierLisse −
 * resteAVivre`. No competitor (Monarch, YNAB, Lunch Money, Linxo, Bankin')
 * ships this calculation.
 *
 * PR-BETA-3 refactor: replaced the PR-D3-bis opaque waterfall by an explicit
 * 3-concept tryptique surfaced under the hero number:
 *
 *   ┌────────────────┬────────────────┬────────────────┐
 *   │ Reste dispo    │ Reste à vivre  │ Capacité       │
 *   │  662 €         │  500 € [Adj]   │  162 €         │
 *   └────────────────┴────────────────┴────────────────┘
 *
 * Why kill the waterfall:
 *   - "Revenus − Effort" was already implicit (the Effort card sits beside
 *     this one on the dashboard and shows the breakdown).
 *   - Three concepts collapsed into one "opaque big number" was the exact
 *     pain ADR-009 amendement 2026-05-09 was filed to fix.
 *   - The tryptique surfaces each concept distinctly and exposes the
 *     "Ajuster ce mois" R-10 affordance inline.
 */
export async function CapaciteEpargneCard({
  revenus,
  charges,
  resteAVivre,
  currentMonthYYYYMM,
  locale,
}: Props) {
  const t = await getTranslations('dashboard.capacite');
  const result = capaciteEpargneReelle({ revenus, charges, resteAVivre });
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  const accent = result.isPositive
    ? {
        ringColor: 'ring-success/15',
        iconColor: 'text-success',
        valueColor: 'text-success',
        glowColor: 'bg-success/20',
        gradientFrom: 'from-success/8',
        Icon: CheckCircle2,
        lede: t('ledePositif', { amount: fmt(result.capacite) }),
      }
    : {
        ringColor: 'ring-danger/15',
        iconColor: 'text-danger',
        valueColor: 'text-danger',
        glowColor: 'bg-danger/20',
        gradientFrom: 'from-danger/8',
        Icon: AlertCircle,
        lede: t('ledeNegatif'),
      };

  // Force "+12,34 €" prefix on positive values so the affirmative framing is
  // unambiguous; the formatter omits the sign for non-negative numbers by
  // default. Zero stays unsigned (still positive per `isPositive`).
  const formatted = fmt(result.capacite);
  const signed = result.capacite.gt(0) ? `+${formatted}` : formatted;
  const tooltipText = t('tooltip', { resteAVivre: fmt(result.resteAVivre) });

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

      <CardContent className="relative flex flex-col gap-4">
        {/* Hero number + tooltip affordance */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <p
              className={`text-4xl font-bold tracking-tight tabular-nums ${accent.valueColor}`}
              data-testid="capacite-epargne-value"
            >
              {signed}
            </p>
            <span
              className="text-muted-foreground/70 hover:text-foreground inline-flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded-full transition-colors"
              title={tooltipText}
              aria-label={tooltipText}
              data-testid="capacite-epargne-tooltip"
              tabIndex={0}
            >
              <Info className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </span>
          </div>
          <p
            className="text-muted-foreground text-sm leading-relaxed"
            data-testid="capacite-epargne-lede"
          >
            {accent.lede}
          </p>
        </div>

        {/* Tryptique sub-stats — ADR-009 amendement 2026-05-09 */}
        <dl
          className="border-border/60 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3 sm:gap-2"
          data-testid="capacite-epargne-substats"
        >
          <SubStat
            label={t('subStats.resteDisponible')}
            value={fmt(result.resteDisponible)}
            testId="substat-reste-disponible"
          />
          <SubStat
            label={t('subStats.resteAVivre')}
            value={fmt(result.resteAVivre)}
            testId="substat-reste-a-vivre"
            secondary={
              <AjusterResteAVivreDrawer
                currentMonthYYYYMM={currentMonthYYYYMM}
                initialResteAVivre={result.resteAVivre.toNumber()}
                monthlyIncome={revenus.toNumber()}
                triggerLabel={t('subStats.ajusterCeMois')}
              />
            }
          />
          <SubStat
            label={t('subStats.capaciteEpargne')}
            value={signed}
            valueClassName={accent.valueColor}
            testId="substat-capacite"
          />
        </dl>
      </CardContent>
    </Card>
  );
}

type SubStatProps = {
  label: string;
  value: string;
  valueClassName?: string;
  secondary?: React.ReactNode;
  testId?: string;
};

function SubStat({ label, value, valueClassName, secondary, testId }: SubStatProps) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={testId}>
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${valueClassName ?? ''}`}>{value}</dd>
      {secondary}
    </div>
  );
}
