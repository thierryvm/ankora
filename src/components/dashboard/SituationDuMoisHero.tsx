import { ArrowRight, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { SituationStatut } from '@/lib/domain/cockpit';
import type { Locale } from '@/i18n/routing';

import { HeroAmount } from './HeroAmount';
import { MonthCurveLive } from './MonthCurveLive';
import { StatusChip, type StatusTone } from './StatusChip';
import type { CurvePoint } from './month-curve-geometry';

/**
 * Exporté pour que les tests puissent typer leur harnais.
 *
 * Le harnais construisait ses props avec `as never`, ce qui désactive TOUTE
 * vérification : trois props requises ont été ajoutées ici sans qu'une seule
 * ligne de `tsc` bouge, et huit cas ont explosé à l'exécution sur un
 * `undefined.length`. Deux props mortes (`budgetVieCourante`, `capacite`,
 * supprimées du composant par ADR-035) y traînaient encore pour la même raison.
 * Un type exporté coûte une ligne et rend l'oubli impossible.
 */
export type SituationDuMoisHeroProps = Props;

type Props = {
  statut: SituationStatut;
  revenus: number;
  chargesFixes: number;
  provisionsLissees: number;
  /** Mensualités lissées des engagements actifs (ADR-021). 0 = masqué. */
  engagementsMensuels: number;
  /** « Budget du mois » (ADR-035) — l'ancre, plus le chiffre-héros. */
  resteDisponible: number;
  /** « Dépensé ce mois » (ADR-035). */
  depensesDuMois: number;
  /** « Il te reste » (ADR-035) — le chiffre-héros, temps réel. */
  ilTeReste: number;
  deficitEpargne: number;
  rattrapageMensuel: number;
  joursRestants: number;
  /** Days elapsed in the month, today included — where the curve stops. */
  joursEcoules: number;
  joursDuMois: number;
  /** « Dépensé ce mois » cumulé jour par jour (`depensesParJour`). */
  serieDuMois: readonly CurvePoint[];
  /**
   * Où la dépense atterrit si le rythme tient. `null` avant le 7ᵉ jour
   * (ADR-035) — la courbe s'arrête alors à aujourd'hui, sans rien inventer.
   */
  depensesProjetees: number | null;
  locale: Locale;
};

const STATUT_ACCENT: Record<
  'vert' | 'orange' | 'rouge',
  { tone: StatusTone; ring: string; from: string }
> = {
  vert: { tone: 'success', ring: 'ring-success/15', from: 'from-success/8' },
  orange: { tone: 'warning', ring: 'ring-warning/15', from: 'from-warning/8' },
  rouge: { tone: 'danger', ring: 'ring-danger/15', from: 'from-danger/8' },
};

/**
 * Hero « Situation du mois » — cockpit dashboard #1, THI-327 Phase 0, revu par
 * ADR-035 puis par le chantier 6 de la refonte 2026.
 *
 * **Ce que cette carte porte, et rien d'autre** : un statut en mots, UN montant
 * dominant, une ligne d'ancrage, et la courbe du mois. C'est le §3.1 de
 * `docs/superpowers/specs/2026-08-08-refonte-app-architecture-cible.md` :
 *
 * > Deux grands nombres ne font pas une réponse : ils font une question.
 *
 * **Ce qu'elle ne porte plus** : la barre d'allocation et la cascade complète,
 * parties dans `CascadeDuMois`. Motif mesuré au navigateur le 2026-08-23, sur un
 * iPhone 14 :
 *
 * ```
 *   fenêtre utile           664 − 65 (en-tête collant) − 49 (onglets) = 550 px
 *   hauteur de cette carte  554 px
 * ```
 *
 * La carte censée répondre à la question du jour dépassait de 4 px la place
 * disponible pour l'afficher — la cascade était donc coupée en plein milieu de
 * sa liste, à chaque chargement. Le lien « D'où vient ce chiffre » ci-dessous
 * mène à la carte qui l'explique : la règle 10 de `CLAUDE.md` n'est pas
 * affaiblie, elle passe d'un empilement à un chemin nommé.
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
        : props.ilTeReste < 0
          ? t('statut.orangeDepasse')
          : t('statut.orangeProvisions');

  let nudge: string | null = null;
  if (props.statut === 'rouge') {
    nudge = t('nudge.rouge', {
      obligations: fmt(props.chargesFixes + props.provisionsLissees + props.engagementsMensuels),
      revenus: fmt(props.revenus),
    });
  } else if (props.statut === 'orange') {
    // ADR-035 — the orange branch used to fire when a user-invented envelope
    // was exceeded. It now fires on « Il te reste » going below zero, which is
    // a fact about their month rather than about a number they guessed.
    nudge =
      props.ilTeReste < 0
        ? t('nudge.orangeDepasse', { montant: fmt(Math.abs(props.ilTeReste)) })
        : t('nudge.orangeProvisions', {
            deficit: fmt(props.deficitEpargne),
            rattrapage: fmt(props.rattrapageMensuel),
          });
  }

  // What is left, per remaining day. Derived from « Il te reste », so it falls
  // as the month is spent instead of restating a fixed envelope divided by a
  // shrinking number of days.
  const perJour =
    props.joursRestants > 0 && props.ilTeReste > 0
      ? t('pace.perDay', {
          amount: fmt(props.ilTeReste / props.joursRestants),
          // The last day of the month, not the count of remaining days: « jusqu'au
          // 31 » is a date the reader recognises without arithmetic, where « sur
          // 13 jours » asks them to do the sum the sentence just did.
          day: props.joursDuMois,
        })
      : null;

  // The state of the month, in words. Three and no fourth: ahead of an even
  // pace, on it, or the budget is already exceeded. A statement of fact in every
  // case — the R-06 doctrine bans « tu dépenses trop », and it is also simply
  // not this screen's job to have an opinion.
  //
  // Computed here and handed to the curve rather than derived inside it: the
  // three labels are already translated in the five locales under `pace.*`, and
  // `MonthCurve` takes translated strings so it can be tested without an i18n
  // provider.
  const spentRatio = props.resteDisponible > 0 ? props.depensesDuMois / props.resteDisponible : 0;
  const paceRatio = props.joursDuMois > 0 ? props.joursEcoules / props.joursDuMois : 0;
  const paceVerdict =
    props.resteDisponible <= 0
      ? null
      : props.depensesDuMois > props.resteDisponible
        ? t('pace.exceeded')
        : spentRatio > paceRatio
          ? t('pace.faster')
          : t('pace.onTrack');

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
      {/* `gap-4 py-5` et non `gap-5 py-6` : 12 px repris sur les respirations
          internes, mesurés au DOM contre les 550 px utiles d'un iPhone 14. La
          courbe a remplacé une barre sept fois moins haute — il fallait les
          reprendre quelque part, et une respiration coûte moins qu'un contenu. */}
      <CardContent className="relative flex flex-col gap-4 py-5">
        {/*
          La puce d'état. L'icône n'est pas choisie ici : `StatusChip` la dérive
          du ton, ce qui rend impossible une puce colorée sans son glyphe —
          c'est-à-dire une information portée par la seule couleur.
        */}
        <div className="flex">
          <StatusChip tone={accent.tone} label={statusTitle} />
        </div>

        {/*
          Hero number — « Il te reste », real-time (ADR-035). It goes down when
          the user records an expense; that feedback loop is the point.

          Colour: neutral ink, danger only when negative. Never green — when
          everything is green, nothing signals any more. The status pill above
          already carries the tone, with an icon, so colour is never alone.
        */}
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.09em] uppercase">
            {t('heroLabel')}
          </p>
          {/*
            A Client Component for one reason: the descent. `HeroAmount` keeps
            the previous value across renders and ticks from old to new over
            ~420 ms when a spend lands (design system §7 — numbers tick, never
            cross-fade). It also applies the ⊕ sheet's optimistic delta so the
            movement starts on the tap rather than on the round-trip (ADR-010).
            Everything else on this card stays server-rendered.
          */}
          <HeroAmount
            value={props.ilTeReste}
            locale={props.locale}
            testId="situation-hero-value"
            className={`text-[46px] leading-none font-bold tracking-[-0.035em] ${
              props.ilTeReste < 0 ? 'text-danger' : 'text-foreground'
            }`}
          />
          <p
            className="text-muted-foreground mt-1.5 text-[13px]"
            data-testid="situation-hero-anchor"
          >
            {t('heroAnchor', {
              budget: fmt(props.resteDisponible),
              depense: fmt(props.depensesDuMois),
            })}
          </p>
          {/*
            Règle 10 de `CLAUDE.md` — « un chiffre qu'on ne peut pas ouvrir est
            une injonction, pas une information ». La décomposition n'est plus
            empilée sous ce chiffre : elle a sa propre carte, juste dessous, et
            ce lien est ce qui l'y rattache. Sans lui, le déplacement aurait
            transformé une règle en perte.
          */}
          <Link
            href="/app#cascade-heading"
            className="text-brand-text-strong focus-visible:ring-brand-700 -mb-2 inline-flex min-h-11 items-center gap-1 self-start rounded-md text-[13px] font-medium underline underline-offset-2 transition-[color,text-underline-offset] hover:underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
            data-testid="situation-cascade-link"
          >
            {t('cascade.lien')}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {/*
          La courbe du mois, à la place de la barre de rythme.

          Elle garde le denominateur honnête de la barre (« Budget du mois ») et
          sa référence de rythme, et corrige son défaut structurel : `PaceBar`
          PLAFONNAIT son remplissage, donc un dépassement de 300 % ressemblait à
          un dépassement de 1 %. Ici l'échelle s'ouvre et le dépassement se voit.

          `MonthCurveLive` plutôt que `MonthCurve` : elle suit le magasin
          optimiste, donc elle bouge du même geste que le chiffre au-dessus
          quand une dépense est saisie. Le verdict a migré dedans — il décrit la
          courbe, il vit avec elle.
        */}
        <div className="flex flex-col gap-2">
          <MonthCurveLive
            serie={props.serieDuMois}
            joursEcoules={props.joursEcoules}
            joursDuMois={props.joursDuMois}
            budgetDuMois={props.resteDisponible}
            depensesDuMois={props.depensesDuMois}
            projection={props.depensesProjetees}
            labels={{
              aria: t('pace.barAria', {
                depense: fmt(props.depensesDuMois),
                budget: fmt(props.resteDisponible),
                jours: props.joursEcoules,
                total: props.joursDuMois,
              }),
              reel: t('courbe.reel'),
              rythme: t('courbe.rythme'),
              projection: t('courbe.projection'),
              verdict: paceVerdict,
            }}
          />
          <span
            className="text-muted-foreground text-xs tabular-nums"
            data-testid="situation-par-jour"
          >
            {perJour ?? ''}
          </span>
        </div>

        {/* Nudge (orange/rouge only) + plan link. */}
        {nudge && (
          <div className="border-border/60 flex flex-col gap-1.5 border-t pt-4">
            <p className="text-muted-foreground text-sm leading-relaxed">{nudge}</p>
            <Link
              href="/app#plan-heading"
              className="text-brand-text-strong focus-visible:ring-brand-700 inline-flex min-h-11 items-center gap-1 self-start rounded-md text-sm font-medium underline underline-offset-2 transition-[color,text-underline-offset] hover:underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
              data-testid="situation-nudge-link"
            >
              {t('voirPlan')}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
