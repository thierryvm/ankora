import { ChevronDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';

import { AllocationBar, type AllocationSegment } from './AllocationBar';

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
 * asynchrone ou à recevoir un formateur — pour un gain nul. La carte, qui a déjà
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

/** Exporté pour que les tests puissent typer leur harnais — cf. le hero. */
export type CascadeDuMoisProps = Props;

type Props = {
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
  /** « Budget du mois » (ADR-035). */
  resteDisponible: number;
  /** « Dépensé ce mois » (ADR-035). */
  depensesDuMois: number;
  /** « Il te reste » (ADR-035) — le chiffre-héros, repris ici comme aboutissement. */
  ilTeReste: number;
  /** « Épargne estimée » (ADR-035). `null` avant le 7ᵉ jour → affiche « — ». */
  epargneEstimee: number | null;
  locale: Locale;
};

/**
 * « D'où vient ce chiffre » — la cascade du mois, JUSTE SOUS LE PLI.
 *
 * Ce bloc vivait dans `SituationDuMoisHero`, empilé sous le chiffre-héros. Le
 * hero mesurait alors **554 px** sur un iPhone 14 dont la fenêtre utile — barre
 * d'onglets et en-tête collant déduits — fait **550 px** : la carte censée
 * répondre à la question du jour ne tenait pas à l'écran, et sa liste de flux
 * était coupée en plein milieu. Mesuré au navigateur le 2026-08-23.
 *
 * La séparation applique le §3.2 de
 * `docs/superpowers/specs/2026-08-08-refonte-app-architecture-cible.md` :
 *
 * > La cascade est l'explication, pas la réponse.
 *
 * Le pli porte la réponse ; cette carte porte sa justification, et le lien
 * « D'où vient ce chiffre » du hero y mène. La règle 10 de `CLAUDE.md` — tout
 * total s'ouvre sur sa décomposition — n'est donc pas affaiblie : elle change
 * d'endroit, d'un empilement à un chemin nommé.
 *
 * Server Component : reçoit des `number` (un `Decimal` ne traverse jamais la
 * frontière RSC — la page convertit via `.toNumber()`).
 */
export async function CascadeDuMois(props: Props) {
  const t = await getTranslations('dashboard.situation');
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, props.locale);

  /**
   * Rend `undefined` sur une liste vide : un poste à 0 € n'a rien à montrer, et
   * une disclosure vide est pire qu'aucune — elle promet une explication qu'elle
   * n'a pas. Les lignes concernées valent alors 0 et restent affichées,
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

  // --- Allocation bar segments (budget négatif → un seul remplissage danger). ---
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

  return (
    <Card data-testid="cascade-du-mois">
      <CardHeader>
        {/*
          `scroll-mt-24` (96 px) n'est pas décoratif : l'en-tête de l'app est
          `sticky` et fait 65 px. Sans cette marge, le lien « D'où vient ce
          chiffre » du pli amène ce titre à `top: 0` — donc PEINT SOUS l'en-tête.
          Mesuré au navigateur le 2026-08-23 : `elementFromPoint` au centre du
          titre rendait le `<div>` de l'en-tête, pas le titre. Un lien qui mène
          à un endroit qu'on ne voit pas ne mène nulle part, et rien dans les
          tests de rendu ne s'en plaindrait.
        */}
        <CardTitle id="cascade-heading" className="scroll-mt-24 text-xl">
          {t('cascade.title')}
        </CardTitle>
        <CardDescription>{t('cascade.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/*
          La barre d'allocation ouvre la carte plutôt que de la clore : elle dit
          en une image ce que le `<dl>` dit ensuite ligne à ligne. Sous le
          chiffre-héros elle entrait en concurrence avec la barre de rythme, et
          deux barres empilées sous un même nombre est la façon la plus sûre
          d'obtenir qu'on ne lise ni l'une ni l'autre.
        */}
        <AllocationBar segments={segments} ariaLabel={barAria} />

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
