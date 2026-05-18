import Decimal from 'decimal.js';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { ProgressBar } from '@/components/atoms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  calculerSanteProvisions,
  type CockpitCharge,
  type PaymentLedger,
  type ReferencePeriod,
} from '@/lib/domain/cockpit';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';

type Props = {
  charges: readonly CockpitCharge[];
  payments: PaymentLedger;
  soldeEpargneActuel: Decimal;
  /** Renamed from the domain's `ref` to avoid clashing with React's reserved `ref` prop. */
  period: ReferencePeriod;
  locale: Locale;
};

type HealthTier = 'success' | 'warning' | 'danger';

/**
 * Health score for provisions — cockpit v3 section #2 of 8 (THI-190, Beta P1).
 *
 * Cards #1 (EffortFinancierCard) and #2 (CapaciteEpargneCard) answer
 * "what is my real monthly burden?". This card answers a different question:
 * "given the periodic charges (annual/quarterly/semiannual) due over the
 * next 12 months, am I saving the right amount each month so I'm never
 * caught short when a bill lands?".
 *
 * Math is delegated to `calculerSanteProvisions()` (ADR-011) — see
 * `src/lib/domain/cockpit/sante-provisions.ts`. The domain returns a binary
 * `statut: 'a_jour' | 'deficit'`; the UI extrapolates a 3-tier visual:
 *   ratio ≥ 1.0   → success (vert)   — on track
 *   ratio ≥ 0.75  → warning (orange) — within striking distance
 *   ratio < 0.75  → danger  (rouge)  — significant deficit
 *
 * Where `ratio = soldeEpargneActuel / totalEpargneTheorique`. The deficit
 * variant also surfaces the 3-month catch-up plan (ADR-011).
 *
 * Empty-state contract: when `totalEpargneTheorique = 0` (no periodic
 * charges scheduled in the next 12 months) we render an educational hint
 * instead of a noisy gauge stuck at 0% — there is no target to track.
 *
 * Server Component (math + i18n only — zero hydration cost).
 */
export async function ProvisionHealthGaugeCard({
  charges,
  payments,
  soldeEpargneActuel,
  period,
  locale,
}: Props) {
  const t = await getTranslations('dashboard.health');
  const result = calculerSanteProvisions({
    charges,
    payments,
    soldeEpargneActuel,
    ref: period,
  });
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  const hasTarget = result.totalEpargneTheorique.gt(0);

  // Ratio in [0, ~Infinity[. Clamped to [0, 1.5] for the ProgressBar visual
  // (display only — accounting math keeps the raw Decimal precision).
  const rawRatio = hasTarget
    ? result.soldeEpargneActuel.dividedBy(result.totalEpargneTheorique).toNumber()
    : 1;
  const ratio = Number.isFinite(rawRatio) ? Math.max(0, rawRatio) : 0;
  const percentLabel = Math.round(ratio * 100);

  const tier: HealthTier =
    !hasTarget || ratio >= 1.0 ? 'success' : ratio >= 0.75 ? 'warning' : 'danger';

  const accent = {
    success: {
      ringColor: 'ring-success/15',
      iconColor: 'text-success',
      valueColor: 'text-success',
      glowColor: 'bg-success/20',
      gradientFrom: 'from-success/8',
      Icon: CheckCircle2,
    },
    warning: {
      ringColor: 'ring-warning/15',
      iconColor: 'text-warning',
      valueColor: 'text-warning',
      glowColor: 'bg-warning/20',
      gradientFrom: 'from-warning/8',
      Icon: Activity,
    },
    danger: {
      ringColor: 'ring-danger/15',
      iconColor: 'text-danger',
      valueColor: 'text-danger',
      glowColor: 'bg-danger/20',
      gradientFrom: 'from-danger/8',
      Icon: AlertTriangle,
    },
  }[tier];

  const statusLabel = tier === 'success' ? t('status.a_jour') : t('status.deficit');
  // ProgressBar already exposes `role="progressbar"` + `aria-valuenow` and
  // uses its `label` prop as the accessible name. CardTitle above is read
  // first by screen readers, so the short `t('ratio')` label is enough —
  // no need for a verbose duplicate aria-label on a roleless wrapper
  // (ARIA 1.2 §6.2 forbids that).
  const ratioLabel = t('ratio');

  return (
    <Card
      className={`relative overflow-hidden ring-1 ring-inset ${accent.ringColor}`}
      data-testid="provision-health-gauge-card"
      data-tier={tier}
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
        {hasTarget ? (
          <>
            <p
              className={`text-4xl font-bold tracking-tight tabular-nums ${accent.valueColor}`}
              data-testid="provision-health-gauge-percent"
            >
              {percentLabel}%
            </p>
            <p className="text-muted-foreground mt-1 text-sm">{statusLabel}</p>
            <div className="mt-4">
              <ProgressBar
                value={ratio}
                max={1}
                tone={tier}
                size="md"
                label={ratioLabel}
                showValue={false}
              />
            </div>
            <dl
              className="mt-4 grid grid-cols-2 gap-3 text-xs"
              data-testid="provision-health-gauge-breakdown"
            >
              <div>
                <dt className="text-muted-foreground">{t('target')}</dt>
                <dd className="text-foreground mt-0.5 font-semibold tabular-nums">
                  {fmt(result.totalEpargneTheorique)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('current')}</dt>
                <dd className="text-foreground mt-0.5 font-semibold tabular-nums">
                  {fmt(result.soldeEpargneActuel)}
                </dd>
              </div>
            </dl>
            {result.statut === 'deficit' && result.rattrapageMensuel.gt(0) && (
              <p
                className="text-muted-foreground mt-3 text-sm leading-relaxed"
                data-testid="provision-health-gauge-rattrapage"
              >
                {t('deficit', { amount: fmt(result.rattrapageMensuel) })}
              </p>
            )}
          </>
        ) : (
          <p
            className="text-muted-foreground text-sm leading-relaxed"
            data-testid="provision-health-gauge-empty"
          >
            {t('empty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
