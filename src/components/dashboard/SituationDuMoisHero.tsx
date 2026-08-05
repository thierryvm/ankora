import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Wallet,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { SituationStatut } from '@/lib/domain/cockpit';
import type { Locale } from '@/i18n/routing';

import { AllocationBar, type AllocationSegment } from './AllocationBar';
import { HeroAmount } from './HeroAmount';
import { PaceBar } from './PaceBar';

/**
 * Une ligne de la décomposition d'un poste — règle 10 de `CLAUDE.md`.
 *
 * Miroir sérialisable de `PostePart` du domaine : les `Decimal` sont convertis
 * en `number` par la page, parce qu'un `Decimal` ne traverse jamais la frontière
 * RSC. La conversion est faite une fois, au passage de la frontière, jamais
 * recalculée ici — la décomposition descend AVEC le chiffre.
 */
export type PartAffichee = {
  id: string;
  libelle: string;
  montantMensuel: number;
  /**
   * Ce qui explique la division, quand il y en a une : « 300 € tous les 3 mois ».
   * `null` pour une charge mensuelle — 150 € par mois n'a rien à expliquer, et
   * cette absence est une information, pas un oubli.
   */
  origine: { montantFacture: number; cycleMois: number } | null;
};

/**
 * Ce que `FlowRow` reçoit pour pouvoir s'ouvrir : des chaînes déjà traduites et
 * déjà formatées.
 *
 * `FlowRow` est une fonction de présentation sans accès aux traductions ni à la
 * locale. Lui passer des nombres l'obligerait à formater, donc à devenir
 * asynchrone ou à recevoir un formateur — pour un gain nul. Le hero, qui a déjà
 * `t` et `fmt`, fait le travail une fois.
 */
type FlowRowDetail = {
  testId: string;
  /** Nom accessible du `<summary>` — « Détail : Lissage ». */
  toggleLabel: string;
  parts: readonly {
    id: string;
    libelle: string;
    montantLabel: string;
    /** « 300 € tous les 3 mois ». `null` quand la part ne subit aucune division. */
    origineLabel: string | null;
  }[];
};

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
  /**
   * De quoi chacun des trois postes soustractifs est fait. Requis, jamais
   * optionnel : un poste affiché sans ses parts est exactement le défaut que la
   * règle 10 interdit, et un champ optionnel laisse ce défaut compiler.
   */
  chargesFixesParts: readonly PartAffichee[];
  lissageParts: readonly PartAffichee[];
  engagementsParts: readonly PartAffichee[];
  /** « Budget du mois » (ADR-035) — l'ancre, plus le chiffre-héros. */
  resteDisponible: number;
  /** « Dépensé ce mois » (ADR-035). */
  depensesDuMois: number;
  /** « Il te reste » (ADR-035) — le chiffre-héros, temps réel. */
  ilTeReste: number;
  /** « Épargne estimée » (ADR-035). `null` avant le 7ᵉ jour → affiche « — ». */
  epargneEstimee: number | null;
  deficitEpargne: number;
  rattrapageMensuel: number;
  provisionsAJour: boolean;
  joursRestants: number;
  /** Days elapsed in the month, today included — positions the pace tick. */
  joursEcoules: number;
  joursDuMois: number;
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
 * THI-327 Phase 0, revu par ADR-035. Narration unique : statut calme +
 * chiffre-héros « Il te reste » (temps réel) + ligne d'ancrage « Budget du
 * mois » + AllocationBar fine (SVG-maison, CSP-safe) + flow vertical + nudge
 * FSMA-safe.
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

  /**
   * Règle 10 de `CLAUDE.md` — « un chiffre qu'on ne peut pas ouvrir est une
   * injonction, pas une information ».
   *
   * Rend `undefined` sur une liste vide : un poste à 0 € n'a rien à montrer, et
   * une disclosure vide est pire qu'aucune — elle promet une explication qu'elle
   * n'a pas. Les trois lignes concernées valent alors 0 et restent affichées,
   * simplement non ouvrables.
   */
  const detail = (
    parts: readonly PartAffichee[],
    testId: string,
    posteLabel: string,
  ): FlowRowDetail | undefined =>
    parts.length === 0
      ? undefined
      : {
          testId,
          toggleLabel: t('flow.detailToggle', { poste: posteLabel }),
          parts: parts.map((part) => ({
            id: part.id,
            libelle: part.libelle,
            montantLabel: fmt(part.montantMensuel),
            origineLabel: part.origine
              ? t('flow.detailOrigine', {
                  montant: fmt(part.origine.montantFacture),
                  cycleMois: part.origine.cycleMois,
                })
              : null,
          })),
        };

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
          // Engagements segment (ADR-021). `--color-muted-foreground` is a
          // text token reused here as a neutral graphic fill on purpose: it's
          // the only palette token visually distinct from the four semantic
          // hues (info/brand/accent/success) AND ≥3:1 vs the track and both
          // neighbours in light + dark (WCAG 1.4.11 verified). The waterfall
          // `<dl>` carries the same figure textually, so the bar stays a
          // supplementary anchor.
          ...(props.engagementsMensuels > 0
            ? [
                {
                  key: 'engagements',
                  ratio: props.engagementsMensuels / props.revenus,
                  fill: 'var(--color-muted-foreground)',
                },
              ]
            : []),
          // ADR-035 — this used to be two segments sized by the envelope: what
          // the user had budgeted for daily living, and the leftover called
          // « capacité d'épargne ». Both were downstream of a number they had
          // to invent. One segment replaces them: what they have actually
          // spent. The unfilled remainder is what is left, which is the
          // question the screen exists to answer.
          {
            key: 'depense',
            ratio:
              Math.max(0, Math.min(props.depensesDuMois, props.resteDisponible)) / props.revenus,
            fill: 'var(--color-accent-400)',
          },
        ];

  const barAria =
    t('barAria', {
      charges: fmt(props.chargesFixes),
      provisions: fmt(props.provisionsLissees),
      depense: fmt(props.depensesDuMois),
      reste: fmt(Math.max(0, props.ilTeReste)),
    }) +
    // Optional clause, appended only when there are engagements — keeps the
    // canonical 4-part string untouched (no i18n regression) while still
    // describing the extra bar segment for screen readers (ADR-021).
    (props.engagementsMensuels > 0
      ? ` ${t('barAriaEngagements', { engagements: fmt(props.engagementsMensuels) })}`
      : '');

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

  // The pace tick, in words. Three states and no fourth: ahead of an even pace,
  // on it, or the budget is already exceeded. A statement of fact in every case
  // — the R-06 doctrine bans « tu dépenses trop », and it is also simply not
  // this screen's job to have an opinion.
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
      <CardContent className="relative flex flex-col gap-5 py-6">
        {/* Status pill (icon + text — never colour alone). */}
        <div className="flex items-center gap-2">
          <accent.Icon
            aria-hidden
            strokeWidth={1.5}
            className={`h-5 w-5 shrink-0 ${accent.icon}`}
          />
          <p className="text-sm font-semibold tracking-tight">{statusTitle}</p>
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
        </div>

        {/*
          The pace bar (§3.3): denominator « Budget du mois », fill « Dépensé ce
          mois », tick at joursEcoules / joursDuMois. It replaced a progress bar
          measured against a 500 € constant nobody chose, and it asks the user
          for nothing — which is what makes it better than an envelope.
        */}
        <div className="flex flex-col gap-2">
          <PaceBar
            budgetDuMois={props.resteDisponible}
            depensesDuMois={props.depensesDuMois}
            joursEcoules={props.joursEcoules}
            joursDuMois={props.joursDuMois}
            ariaLabel={t('pace.barAria', {
              depense: fmt(props.depensesDuMois),
              budget: fmt(props.resteDisponible),
              jours: props.joursEcoules,
              total: props.joursDuMois,
            })}
          />
          <div className="text-muted-foreground flex items-baseline justify-between gap-3 text-xs">
            <span className="tabular-nums" data-testid="situation-par-jour">
              {perJour ?? ''}
            </span>
            {/* The verdict in words rather than an arrow pointing at the tick:
                a glyph the reader has to decode is not an explanation, and the
                design system forbids unicode arrows as decoration. Stated as a
                fact — never « tu dépenses trop » (R-06). */}
            <span data-testid="situation-pace-verdict" className="shrink-0">
              {paceVerdict}
            </span>
          </div>
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

        {/*
          The allocation bar sits HERE now, not under the hero.

          It breaks income down into charges / provisions / engagements / spent —
          which is precisely what the waterfall below states in words, so the two
          belong together as one block. Under the hero it competed with the pace
          bar, and two bars stacked under one figure is how a reader stops
          reading either. Same component, same segments; only the position moved.
        */}
        <div className="border-border/60 border-t pt-4">
          <AllocationBar segments={segments} ariaLabel={barAria} />
        </div>

        {/* Waterfall flow. */}
        <dl className="flex flex-col gap-2 text-sm">
          <FlowRow label={t('flow.revenus')} value={fmt(props.revenus)} />
          <FlowRow
            label={t('flow.chargesFixes')}
            value={`− ${fmt(props.chargesFixes)}`}
            muted
            dotClass="bg-info"
            detail={detail(props.chargesFixesParts, 'flow-detail-charges', t('flow.chargesFixes'))}
          />
          <FlowRow
            label={t('flow.lissage')}
            value={`− ${fmt(props.provisionsLissees)}`}
            muted
            dotClass="bg-brand-500"
            detail={detail(props.lissageParts, 'flow-detail-lissage', t('flow.lissage'))}
          />
          {props.engagementsMensuels > 0 && (
            <FlowRow
              label={t('flow.engagements')}
              value={`− ${fmt(props.engagementsMensuels)}`}
              muted
              dotClass="bg-muted-foreground"
              detail={detail(
                props.engagementsParts,
                'flow-detail-engagements',
                t('flow.engagements'),
              )}
            />
          )}
          <div className="border-border mt-1 border-t pt-2">
            <FlowRow label={t('flow.resteDisponible')} value={fmt(props.resteDisponible)} strong />
          </div>
          <FlowRow
            label={t('flow.depense')}
            value={`− ${fmt(props.depensesDuMois)}`}
            muted
            dotClass="bg-warning"
          />
          <div className="border-border border-t pt-2">
            <FlowRow label={t('flow.ilTeReste')} value={fmt(props.ilTeReste)} strong />
          </div>
          {/*
            « Épargne estimée » — a projection of the current spending pace, not
            an envelope the user has to invent. `null` before the 7th day of the
            month renders « — »: extrapolating a month from two days is noise,
            and "no estimate yet" is not "an estimate of zero".
          */}
          <div className="text-muted-foreground flex items-center justify-between gap-2 pl-3 text-xs">
            <dt className="flex items-center gap-2">
              <span aria-hidden className="bg-brand-500 h-2 w-2 shrink-0 rounded-full" />
              {t('flow.epargneEstimee')}
            </dt>
            <dd className="tabular-nums" data-testid="situation-epargne-estimee">
              {props.epargneEstimee === null ? '—' : fmt(props.epargneEstimee)}
            </dd>
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
  dotClass,
  detail,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  /** Tailwind bg-* class matching this row's AllocationBar segment colour. */
  dotClass?: string;
  /**
   * De quoi ce total est fait. Absent = ce montant n'est pas une somme (les
   * revenus, ou un solde comme « Il te reste »), donc il n'y a rien à ouvrir.
   */
  detail?: FlowRowDetail;
}) {
  const amountClass = `tabular-nums ${strong ? 'font-bold' : 'font-medium'} text-foreground`;

  return (
    <div className="flex items-start justify-between gap-3">
      <dt
        className={`flex items-center gap-2 ${muted ? 'text-muted-foreground' : 'text-foreground'}`}
      >
        {dotClass && (
          <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        )}
        {label}
      </dt>
      {/*
        Le panneau vit DANS le `<dd>`, et pas en frère du couple `dt`/`dd` :
        un `<div>` enfant d'un `<dl>` ne peut contenir que des `dt` et des `dd`.
        Le `flex-1` lui rend la largeur dont il a besoin pour être lisible à
        390 px — sans quoi il se serrerait sous le montant.
      */}
      <dd className={detail ? 'min-w-0 flex-1' : amountClass}>
        {detail ? (
          <details className="group" data-testid={detail.testId}>
            {/*
              `min-h-11` : 44 px, le minimum tactile. Le montant reste aligné à
              droite comme sur les lignes non ouvrables, donc la colonne des
              chiffres ne se casse pas. Mêmes classes que le panneau de
              projection des provisions, pour que deux disclosures de la même
              app ne se ressemblent pas « à peu près ».
            */}
            <summary className="focus-visible:ring-brand-600 flex min-h-11 cursor-pointer list-none items-center justify-end gap-1.5 rounded focus-visible:ring-2 focus-visible:outline-none">
              <span className={amountClass}>{value}</span>
              <ChevronDown
                aria-hidden
                className="text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
              />
              <span className="sr-only">{detail.toggleLabel}</span>
            </summary>

            {/*
              Deux lignes par part, et non deux colonnes.

              La version en colonnes tronquait les libellés à 390 px : « Assura… »,
              « Précomp… », « Taxe … » — mesuré au navigateur. Une décomposition
              qui coupe le nom qu'elle existe pour révéler ne sert à rien, et le
              constat de @thierry portait précisément sur « à quelle facture cela
              correspond ». Le libellé prend donc toute la largeur ; le montant
              reste aligné à droite pour rester comparable d'une ligne à l'autre,
              et l'échéance passe dessous.
            */}
            <ul className="mt-1 mb-2 flex flex-col gap-2">
              {detail.parts.map((part) => (
                <li key={part.id} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-foreground min-w-0">{part.libelle}</span>
                    <span className="text-foreground shrink-0 tabular-nums">
                      {part.montantLabel}
                    </span>
                  </div>
                  {part.origineLabel && (
                    <p className="text-muted-foreground mt-0.5">{part.origineLabel}</p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
