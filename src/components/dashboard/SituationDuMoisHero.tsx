import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { SituationStatut } from '@/lib/domain/cockpit';
import type { Locale } from '@/i18n/routing';

import { AllocationBar, type AllocationSegment } from './AllocationBar';
import { AjusterResteAVivreDrawer } from './AjusterResteAVivreDrawer';

type Props = {
  statut: SituationStatut;
  revenus: number;
  chargesFixes: number;
  provisionsLissees: number;
  resteDisponible: number;
  budgetVieCourante: number;
  capacite: number;
  deficitEpargne: number;
  rattrapageMensuel: number;
  provisionsAJour: boolean;
  joursRestants: number;
  currentMonthYYYYMM: string;
  locale: Locale;
};

const STATUT_ACCENT = {
  vert: {
    Icon: CheckCircle2,
    ring: 'ring-success/15',
    icon: 'text-success',
    from: 'from-success/8',
  },
  orange: {
    Icon: AlertTriangle,
    ring: 'ring-warning/15',
    icon: 'text-warning',
    from: 'from-warning/8',
  },
  rouge: { Icon: AlertCircle, ring: 'ring-danger/15', icon: 'text-danger', from: 'from-danger/8' },
} as const;

/**
 * Hero « Situation du mois » — cockpit dashboard #1 (NORTH_STAR waterfall),
 * THI-327 Phase 0. Subsume les anciennes cartes Effort + Capacité en une
 * narration unique : statut calme + chiffre-héros « Reste disponible » +
 * AllocationBar fine (SVG-maison, CSP-safe) + flow vertical + nudge FSMA-safe.
 *
 * Server Component : reçoit des `number` (un `Decimal` ne traverse jamais la
 * frontière RSC — la page convertit via `.toNumber()`).
 */
export async function SituationDuMoisHero(props: Props) {
  const t = await getTranslations('dashboard.situation');
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, props.locale);

  // --- Incomplet (THI-335): no waterfall, no negative number, calm CTA. ---
  if (props.statut === 'incomplet') {
    return (
      <Card
        className="ring-info/15 relative overflow-hidden ring-1 ring-inset"
        data-testid="situation-hero"
        data-statut="incomplet"
      >
        <div
          aria-hidden
          className="from-info/8 pointer-events-none absolute inset-0 bg-linear-to-br to-transparent"
        />
        <CardContent className="relative flex flex-col gap-3 py-6">
          <div className="flex items-center gap-2">
            <Wallet aria-hidden strokeWidth={1.5} className="text-info h-6 w-6 shrink-0" />
            <p className="text-lg font-semibold tracking-tight">{t('incomplet.title')}</p>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">{t('incomplet.body')}</p>
          <Button asChild variant="outline" size="sm" className="min-h-11 self-start px-4">
            <Link href="/app/accounts" data-testid="situation-setup-cta">
              {t('incomplet.cta')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const accent = STATUT_ACCENT[props.statut];

  // --- Status line (title + optional nudge). ---
  const statusTitle =
    props.statut === 'vert'
      ? t('statut.vert')
      : props.statut === 'rouge'
        ? t('statut.rouge')
        : props.capacite < 0
          ? t('statut.orangeCapacite')
          : t('statut.orangeProvisions');

  let nudge: string | null = null;
  if (props.statut === 'rouge') {
    nudge = t('nudge.rouge', {
      obligations: fmt(props.chargesFixes + props.provisionsLissees),
      revenus: fmt(props.revenus),
    });
  } else if (props.statut === 'orange') {
    nudge =
      props.capacite < 0
        ? t('nudge.orangeCapacite', { capacite: fmt(props.capacite) })
        : t('nudge.orangeProvisions', {
            deficit: fmt(props.deficitEpargne),
            rattrapage: fmt(props.rattrapageMensuel),
          });
  }

  // --- Allocation bar segments (rouge → single danger fill). ---
  const segments: AllocationSegment[] =
    props.resteDisponible < 0 || props.revenus <= 0
      ? [{ key: 'overflow', ratio: 1, fill: 'var(--color-danger)' }]
      : [
          { key: 'charges', ratio: props.chargesFixes / props.revenus, fill: 'var(--color-info)' },
          {
            key: 'provisions',
            ratio: props.provisionsLissees / props.revenus,
            fill: 'var(--color-brand-500)',
          },
          {
            key: 'vie',
            ratio:
              Math.max(0, Math.min(props.budgetVieCourante, props.resteDisponible)) / props.revenus,
            fill: 'var(--color-accent-400)',
          },
          ...(props.capacite > 0
            ? [
                {
                  key: 'epargne',
                  ratio: props.capacite / props.revenus,
                  fill: 'var(--color-success)',
                },
              ]
            : []),
        ];

  const barAria = t('barAria', {
    charges: fmt(props.chargesFixes),
    provisions: fmt(props.provisionsLissees),
    vieCourante: fmt(props.budgetVieCourante),
    epargne: fmt(Math.max(0, props.capacite)),
  });

  const perJour =
    props.joursRestants > 0 && props.budgetVieCourante > 0
      ? t('flow.parJour', { amount: fmt(props.budgetVieCourante / props.joursRestants) })
      : null;

  return (
    <Card
      className={`relative overflow-hidden ring-1 ring-inset ${accent.ring}`}
      data-testid="situation-hero"
      data-statut={props.statut}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-linear-to-br ${accent.from} to-transparent`}
      />
      <CardContent className="relative grid gap-x-10 gap-y-6 py-6 md:grid-cols-2">
        {/* Left column — status + hero number + allocation bar + nudge. */}
        <div className="flex flex-col gap-5">
          {/* Status pill (icon + text — never colour alone). */}
          <div className="flex items-center gap-2">
            <accent.Icon
              aria-hidden
              strokeWidth={1.5}
              className={`h-5 w-5 shrink-0 ${accent.icon}`}
            />
            <p className="text-sm font-semibold tracking-tight">{statusTitle}</p>
          </div>

          {/* Hero number. */}
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {t('heroLabel')}
            </p>
            <p
              className="text-foreground text-4xl font-bold tracking-tight tabular-nums"
              data-testid="situation-hero-value"
            >
              {fmt(props.resteDisponible)}
            </p>
            <p className="text-muted-foreground text-sm">{t('heroSubtitle')}</p>
          </div>

          {/* Allocation bar (supplementary visual anchor). */}
          <AllocationBar segments={segments} ariaLabel={barAria} />

          {/* Nudge (orange/rouge only) + plan link. */}
          {nudge && (
            <div className="border-border/60 flex flex-col gap-1.5 border-t pt-4">
              <p className="text-muted-foreground text-sm leading-relaxed">{nudge}</p>
              <Link
                href="/app#plan-heading"
                className="text-brand-text-strong inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2"
                data-testid="situation-nudge-link"
              >
                {t('voirPlan')}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </div>

        {/* Right column — waterfall flow. Divider: top on mobile, left on desktop. */}
        <dl className="border-border/60 flex flex-col justify-center gap-2 border-t pt-6 text-sm md:border-t-0 md:border-l md:pt-0 md:pl-10">
          <FlowRow label={t('flow.revenus')} value={fmt(props.revenus)} />
          <FlowRow label={t('flow.chargesFixes')} value={`− ${fmt(props.chargesFixes)}`} muted />
          <FlowRow label={t('flow.provisions')} value={`− ${fmt(props.provisionsLissees)}`} muted />
          <div className="border-border mt-1 border-t pt-2">
            <FlowRow label={t('flow.resteDisponible')} value={fmt(props.resteDisponible)} strong />
          </div>
          <div className="text-muted-foreground flex items-center justify-between gap-2 pl-3 text-xs">
            <dt className="flex items-center gap-2">
              <span>· {t('flow.resteAVivre')}</span>
              <AjusterResteAVivreDrawer
                currentMonthYYYYMM={props.currentMonthYYYYMM}
                initialResteAVivre={props.budgetVieCourante}
                monthlyIncome={props.revenus}
                triggerLabel={t('flow.ajuster')}
              />
            </dt>
            <dd className="tabular-nums">
              {fmt(props.budgetVieCourante)}
              {perJour ? <span className="ml-2">{perJour}</span> : null}
            </dd>
          </div>
          <div className="text-muted-foreground flex items-center justify-between gap-2 pl-3 text-xs">
            <dt>· {t('flow.capaciteEpargne')}</dt>
            <dd className="tabular-nums">{fmt(Math.max(0, props.capacite))}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function FlowRow({
  label,
  value,
  muted = false,
  strong = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? 'text-muted-foreground' : 'text-foreground'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-bold' : 'font-medium'} text-foreground`}>
        {value}
      </dd>
    </div>
  );
}
