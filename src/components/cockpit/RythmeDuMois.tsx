'use client';

import { useState } from 'react';
import Decimal from 'decimal.js';
import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Repli } from '@/components/cockpit/Repli';
import { Sheet } from '@/components/primitives/Sheet';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { ecartAuRythme, rythmeAuJour, sensDeLEcart } from '@/lib/domain/cockpit/rythme';
import { formatCurrency } from '@/lib/i18n/formatters';

import { moisDansLaPhrase } from './mois-vu';

/**
 * « Rythme du mois » (G-rythme) — the cockpit card that follows the month's
 * spending day by day against the pace of the budget. Mockup: `carteRythme`,
 * `svgRythmeG`, `detailJoursG` and the `g-jour` / `g-rythme` drawers.
 *
 * Folded below lg, with the gap to the pace in words as the fold's key; whole
 * on desktop. Every figure opens on what composes it: a slice of days opens
 * `g-jour`, the header opens `g-rythme` (total, pace, projection, budget and
 * its source).
 *
 * Nothing is computed here that the domain does not already compute: the
 * spending per day and its running total come from `depensesParJour`, the
 * projection from `depensesProjetees`, the budget and its parts from the month
 * situation, and the pace and its gap from `rythmeAuJour` / `ecartAuRythme`.
 * Amounts arrive as numbers: a Decimal never crosses the RSC boundary.
 */

export type RythmeDuMoisProps = Readonly<{
  year: number;
  month: number;
  joursDuMois: number;
  /** Today's day of the month, today included. */
  joursEcoules: number;
  /**
   * ADR-047 — days between the 1st of `year`/`month` and the first day of the
   * budget month (27 when October opened on 28 September, with `month` = 9).
   * Absent: the calendar month.
   */
  decalage?: number;
  /**
   * ADR-047 — the budget month (1–12) the window belongs to. It differs from
   * `month` when the window opened in the previous month. Absent: `month`.
   */
  moisDeBudget?: number;
  /** `depensesParJour`: one point per day, with its running total. */
  serie: ReadonlyArray<Readonly<{ jour: number; duJour: number; cumule: number }>>;
  /** The month's expenses, for the lines of each day. */
  depenses: ReadonlyArray<Readonly<{ id: string; label: string; montant: number; date: string }>>;
  /** « Dépensé ce mois » — the base of the projection. */
  depensesDuMois: number;
  /** `depensesProjetees`, or null (nothing before the 7th day). */
  projection: number | null;
  /**
   * `situation.epargneEstimee` — the SAME figure as the domain's, or null
   * (null exactly when `projection` is). Shown in the ÉPARGNE block (G-12).
   */
  epargne: number | null;
  /**
   * G-31, `tropTotPourProjeter`: under 7 days of data AND under 5 expenses.
   * Then neither the projection nor the savings figure is written anywhere on
   * the card, and the block says « Trop tôt pour projeter » instead.
   */
  tropTot: boolean;
  /** The month budget (`resteDisponible`) and the parts it is made of. */
  budget: Readonly<{
    montant: number;
    revenus: number;
    /** The figure is the written income (issue #504): « Revenu prévu », not « Argent reçu ». */
    revenuPrevu?: boolean;
    /** « Déjà compté pour tes factures » (`situation.retenu`): bills + monthly share + instalments. */
    retenu: number;
    chargesFixes: number;
    provisionsLissees: number;
    engagementsMensuels: number;
    misDeCote: number;
  }>;
}>;

type Tiroir = { a: number; b: number; mois: boolean };

// Literal class tables: Tailwind reads sources as text, a class built at run
// time would never be generated.
/**
 * Literal class names, so Tailwind generates them. A budget month runs from
 * one day of the previous month (ADR-047) to the last day of its own: up to
 * 31 + 31 days.
 */
const GRILLE: Record<number, string> = {
  28: 'grid-cols-28',
  29: 'grid-cols-29',
  30: 'grid-cols-30',
  31: 'grid-cols-31',
  32: 'grid-cols-32',
  33: 'grid-cols-33',
  34: 'grid-cols-34',
  35: 'grid-cols-35',
  36: 'grid-cols-36',
  37: 'grid-cols-37',
  38: 'grid-cols-38',
  39: 'grid-cols-39',
  40: 'grid-cols-40',
  41: 'grid-cols-41',
  42: 'grid-cols-42',
  43: 'grid-cols-43',
  44: 'grid-cols-44',
  45: 'grid-cols-45',
  46: 'grid-cols-46',
  47: 'grid-cols-47',
  48: 'grid-cols-48',
  49: 'grid-cols-49',
  50: 'grid-cols-50',
  51: 'grid-cols-51',
  52: 'grid-cols-52',
  53: 'grid-cols-53',
  54: 'grid-cols-54',
  55: 'grid-cols-55',
  56: 'grid-cols-56',
  57: 'grid-cols-57',
  58: 'grid-cols-58',
  59: 'grid-cols-59',
  60: 'grid-cols-60',
  61: 'grid-cols-61',
  62: 'grid-cols-62',
};
const DEBUT = [
  '',
  'col-start-1',
  'col-start-2',
  'col-start-3',
  'col-start-4',
  'col-start-5',
  'col-start-6',
  'col-start-7',
  'col-start-8',
  'col-start-9',
  'col-start-10',
  'col-start-11',
  'col-start-12',
  'col-start-13',
  'col-start-14',
  'col-start-15',
  'col-start-16',
  'col-start-17',
  'col-start-18',
  'col-start-19',
  'col-start-20',
  'col-start-21',
  'col-start-22',
  'col-start-23',
  'col-start-24',
  'col-start-25',
  'col-start-26',
  'col-start-27',
  'col-start-28',
  'col-start-29',
  'col-start-30',
  'col-start-31',
  'col-start-32',
  'col-start-33',
  'col-start-34',
  'col-start-35',
  'col-start-36',
  'col-start-37',
  'col-start-38',
  'col-start-39',
  'col-start-40',
  'col-start-41',
  'col-start-42',
  'col-start-43',
  'col-start-44',
  'col-start-45',
  'col-start-46',
  'col-start-47',
  'col-start-48',
  'col-start-49',
  'col-start-50',
  'col-start-51',
  'col-start-52',
  'col-start-53',
  'col-start-54',
  'col-start-55',
  'col-start-56',
  'col-start-57',
  'col-start-58',
  'col-start-59',
  'col-start-60',
  'col-start-61',
  'col-start-62',
];
const ETENDUE = [
  '',
  'col-span-1',
  'col-span-2',
  'col-span-3',
  'col-span-4',
  'col-span-5',
  'col-span-6',
  'col-span-7',
];

/** Five days per slice: about 52 px at 375, above the 44 px target. */
const TRANCHE = 5;

/** Elapsed days 1..jE in slices of five; a last slice under three days joins the one before. */
export function tranchesDeJours(jE: number): Array<[number, number]> {
  const t: Array<[number, number]> = [];
  for (let a = 1; a <= jE; a += TRANCHE) t.push([a, Math.min(a + TRANCHE - 1, jE)]);
  const der = t.at(-1);
  if (der && t.length > 1 && der[1] - der[0] + 1 < 3) {
    t.pop();
    t.at(-1)![1] = der[1];
  }
  return t;
}

/** ADR-047 — the window opened in the month before its budget month. */
function horsDuMois(p: Readonly<{ month: number; moisDeBudget?: number }>): boolean {
  return (p.moisDeBudget ?? p.month) !== p.month;
}

/**
 * Axis ticks, as day indexes. A calendar month keeps 1, 5, 10… and its last
 * day. Shifted (ADR-047), dates are wider than numbers: one tick a week from
 * the first day, and the last day, dropping a weekly tick too close to it.
 */
export function reperesDeLAxe(jM: number, enDates: boolean): number[] {
  if (!enDates)
    return [1, 5, 10, 15, 20, 25, jM].filter((j, i, a) => j <= jM && a.indexOf(j) === i);
  const t: number[] = [];
  for (let j = 1; j <= jM - 4; j += 7) t.push(j);
  t.push(jM);
  return t;
}

function useFormats(decalage = 0) {
  const locale = useLocale() as Locale;
  const euros = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  // ADR-047 — `day` is the index in the budget month; `decalage` shifts it to
  // the calendar (October opened on 28 September: index 1 is the 28th).
  // Date.UTC carries an overflowing day into the next month.
  const reel = (year: number, month: number, day: number) =>
    new Date(Date.UTC(year, month - 1, day + decalage));
  const date = (year: number, month: number, day: number, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' }).format(reel(year, month, day));
  const premier = (y: number, m: number, d: number) => reel(y, m, d).getUTCDate() === 1;
  const fr = locale.startsWith('fr');
  return {
    euro: (v: number) => euros.format(v),
    centime: (v: number) => formatCurrency(v, locale),
    moins: (v: number) => `−${formatCurrency(v, locale)}`,
    // « 1er » in French, as in the mockup; Intl writes « 1 ».
    numJour: (y: number, m: number, d: number) =>
      fr && premier(y, m, d) ? '1er' : date(y, m, d, { day: 'numeric' }),
    jourMois: (y: number, m: number, d: number) =>
      fr && premier(y, m, d)
        ? `1er ${date(y, m, d, { month: 'long' })}`
        : date(y, m, d, { day: 'numeric', month: 'long' }),
    jourMoisCourt: (y: number, m: number, d: number) =>
      date(y, m, d, { day: 'numeric', month: 'short' }),
    /** `YYYY-MM-DD` of index `d`. */
    iso: (y: number, m: number, d: number) => reel(y, m, d).toISOString().slice(0, 10),
  };
}

export function RythmeDuMois(props: RythmeDuMoisProps) {
  const { year, month, joursDuMois: jM, serie, depenses, tropTot } = props;
  // G-31: too early, no projection is written anywhere — header, key, trace, drawer.
  const projection = tropTot ? null : props.projection;
  const t = useTranslations('cockpit.rythme');
  const tr = useTranslations('cockpit.replis');
  const f = useFormats(props.decalage ?? 0);
  const locale = useLocale();
  const [tiroir, setTiroir] = useState<Tiroir | null>(null);

  const jE = Math.max(0, Math.min(props.joursEcoules, jM));
  const cumul = (j: number) => (j <= 0 ? 0 : (serie[j - 1]?.cumule ?? 0));
  // Server figures only: an optimistic delta would move the header while the
  // drawers it opens still list the server's days (review, tour 45).
  const depense = cumul(jE);
  const budget = new Decimal(props.budget.montant);
  const aB = budget.gt(0);
  const rythme = rythmeAuJour(budget, jE, jM);
  const ecart = rythme ? ecartAuRythme(new Decimal(depense), rythme) : null;
  const enCours = jE < jM;
  // ADR-047 — the savings line names the budget month, never the calendar one.
  const mois = moisDansLaPhrase(props.moisDeBudget ?? month, locale);
  const jourMois = (d: number) => f.jourMois(year, month, d);
  // Opened in the previous month, an index is not a day of the budget month:
  // the last day is named by its date.
  const jourFin = horsDuMois(props) ? f.jourMoisCourt(year, month, jM) : jM;

  const motEcart = (e: Decimal, montant: (v: number) => string) => {
    const sens = sensDeLEcart(e);
    const v = montant(e.abs().toNumber());
    return sens === 'pile'
      ? t('ecartPile')
      : sens === 'marge'
        ? t('ecartMarge', { montant: v })
        : t('ecartDessus', { montant: v });
  };
  const cleEcart = (e: Decimal) => {
    const sens = sensDeLEcart(e);
    const v = f.euro(e.abs().toNumber());
    return sens === 'pile'
      ? t('clePile')
      : sens === 'marge'
        ? t('cleMarge', { montant: v })
        : t('cleDessus', { montant: v });
  };

  const vide = depenses.length === 0;
  const cle = !vide && ecart ? cleEcart(ecart) : tr('cleRythme', { jours: Math.max(0, jM - jE) });

  return (
    <Repli titre={tr('rythme')} cle={cle} testId="repli-rythme" ouvertAuBureau>
      <div data-surface="G-rythme">
        <p className="text-muted-foreground mb-2 hidden font-mono text-xs tracking-wide uppercase lg:block">
          {t('etiquette')}
        </p>
        {vide ? (
          <div>
            <p className="text-sm font-medium">{t('videTitre', { mois })}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t('videAide')}</p>
            <Link
              href="/app/expenses"
              className="text-brand-text mt-2 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
            >
              {t('ajouter')}
            </Link>
          </div>
        ) : (
          <>
            <button
              type="button"
              data-testid="rythme-entete"
              aria-label={t('enteteAria', {
                montant: f.euro(depense),
                jour: jourMois(jE),
                ecart: ecart ? `, ${motEcart(ecart, f.euro)}` : '',
              })}
              onClick={() => setTiroir({ a: 1, b: jE, mois: true })}
              className="focus-visible:ring-brand-600 active:bg-surface-muted relative flex min-h-11 w-full flex-col items-start gap-1 rounded-md py-1 pr-8 text-left focus-visible:ring-2 focus-visible:outline-none"
            >
              <strong className="font-mono text-2xl font-semibold tabular-nums">
                {f.euro(depense)}
              </strong>
              <span className="text-muted-foreground text-sm">
                {t('depensesAu', { jour: f.jourMoisCourt(year, month, jE) })}
              </span>
              {ecart && (
                <span className="bg-surface-muted rounded-full px-2.5 py-0.5 text-sm font-medium">
                  {motEcart(ecart, f.euro)}
                </span>
              )}
              {aB && enCours && projection !== null && (
                <span className="text-sm">
                  {t('projection', {
                    projection: f.euro(projection),
                    budget: f.euro(budget.toNumber()),
                    jour: jM,
                  })}
                </span>
              )}
              <ChevronRight
                aria-hidden
                strokeWidth={1.5}
                className="absolute top-2 right-0 h-5 w-5"
              />
            </button>
            <p className="text-muted-foreground border-border mt-2 border-l-2 pl-2 text-xs">
              <NoteBudget budget={props.budget} />
            </p>
            <Trace
              {...props}
              projection={projection}
              jE={jE}
              depense={depense}
              onTranche={(a, b) => setTiroir({ a, b, mois: false })}
            />
            <ul className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Cle trait="plein">{t('legendeCumul')}</Cle>
              {aB && (
                <Cle trait="points">
                  {t('legendeRythme', { budget: f.euro(budget.toNumber()) })}
                </Cle>
              )}
              {aB && enCours && projection !== null && (
                <Cle trait="tirets">
                  {t('legendeProjection', { jour: jourFin, montant: f.euro(projection) })}
                </Cle>
              )}
            </ul>
            <p className="text-muted-foreground mt-1 text-xs">{t('sousTrace')}</p>
            <BlocEpargne
              tropTot={tropTot}
              epargne={tropTot ? null : props.epargne}
              mois={mois}
              jour={jourFin}
              euro={f.euro}
            />
          </>
        )}
      </div>
      {tiroir && (
        <TiroirRythme
          {...props}
          projection={projection}
          jE={jE}
          tiroir={tiroir}
          onClose={() => setTiroir(null)}
        />
      )}
    </Repli>
  );
}
/**
 * The ÉPARGNE block (G-12, mockup `blocEpargne` / `blocTropTot`): the savings
 * figure with its source « calculé » and its operation in one line. The word
 * « estimé » is gone from this block. Too early (G-31): the label loses
 * « calculé » — nothing is calculated — and no amount is written.
 */
function BlocEpargne(
  props: Readonly<{
    tropTot: boolean;
    epargne: number | null;
    mois: string;
    jour: number | string;
    euro: (v: number) => string;
  }>,
) {
  const t = useTranslations('cockpit.rythme.epargne');
  const { tropTot, epargne, mois, jour, euro } = props;
  return (
    <div data-testid="rythme-epargne" className="border-border mt-4 border-t pt-3">
      <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
        {tropTot ? t('etiquette') : t('etiquetteCalcule')}
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        {tropTot
          ? t('tropTot')
          : epargne === null
            ? t('desLe7', { mois })
            : t('operation', { mois, montant: euro(epargne), jour })}
      </p>
    </div>
  );
}

/** Where the budget comes from, in one sentence (rule 3: every figure declares its source). */
function NoteBudget({ budget: b }: Readonly<{ budget: RythmeDuMoisProps['budget'] }>) {
  const t = useTranslations('cockpit.rythme');
  const { euro } = useFormats();
  const retenu = b.retenu;
  return b.montant > 0 ? (
    <>
      {t('noteBudget', {
        revenus: euro(b.revenus),
        retenu: euro(retenu),
        mis: b.misDeCote > 0 ? 'oui' : 'non',
        misMontant: euro(b.misDeCote),
      })}
    </>
  ) : (
    <>
      {t('sansBudget', { budget: euro(b.montant), retenu: euro(retenu), revenus: euro(b.revenus) })}
    </>
  );
}

function Cle({
  trait,
  children,
}: Readonly<{ trait: 'plein' | 'points' | 'tirets'; children: React.ReactNode }>) {
  return (
    <li className="flex items-center gap-1.5">
      <svg aria-hidden viewBox="0 0 16 4" className="h-1 w-4">
        <line
          x1={0}
          y1={2}
          x2={16}
          y2={2}
          strokeWidth={trait === 'points' ? 1.5 : 2}
          strokeDasharray={trait === 'points' ? '2 3' : trait === 'tirets' ? '5 3' : undefined}
          className={trait === 'points' ? 'stroke-muted-foreground' : 'stroke-serie-depenses'}
        />
      </svg>
      {children}
    </li>
  );
}

/**
 * The drawing: running total (area and line, spending series), the pace of the
 * budget (neutral dots), the projection (dashes) and today's mark — a vertical
 * stroke, never a circle, since this frame stretches with the card. Over it,
 * one button per slice of elapsed days; below it, the day axis.
 */
function Trace(
  props: RythmeDuMoisProps & {
    jE: number;
    depense: number;
    onTranche: (a: number, b: number) => void;
  },
) {
  const { year, month, joursDuMois: jM, jE, depense, serie, projection, onTranche } = props;
  const t = useTranslations('cockpit.rythme');
  const f = useFormats(props.decalage ?? 0);
  const budget = props.budget.montant;
  const aB = budget > 0;
  const auServeur = (j: number) => (j <= 0 ? 0 : (serie[j - 1]?.cumule ?? 0));
  // Today's point follows the header figure (optimistic); slice totals read the server series.
  const cumul = (j: number) => (j === jE ? depense : auServeur(j));
  const proj = jE < jM && projection !== null ? projection : null;
  const max = Math.max(1, aB ? budget : 0, cumul(jE), proj ?? 0);
  const y = (v: number) => Math.round((100 - (92 * v) / max) * 100) / 100;
  const pts = Array.from({ length: jE + 1 }, (_, j) => `${j},${y(cumul(j))}`);
  const tranches = tranchesDeJours(jE);
  const jourMois = (d: number) => f.jourMois(year, month, d);
  const hors = horsDuMois(props);
  const axe = reperesDeLAxe(jM, hors);
  // ADR-047 — opened in the previous month, the axis names dates, not indexes.
  const repere = (j: number) => (hors ? f.jourMoisCourt(year, month, j) : String(j));
  // A date is wider than a column: centred on the first or last one, it would
  // spill out of the card. The ends align inward.
  const cale = (j: number) =>
    !hors
      ? 'justify-self-center'
      : j === 1
        ? 'justify-self-start'
        : j === jM
          ? 'justify-self-end'
          : 'justify-self-center';
  const suite = `${aB ? t('grapheAriaBudget', { budget: f.euro(budget) }) : ''}${
    proj !== null ? t('grapheAriaProjection', { projection: f.euro(proj), jour: jourMois(jM) }) : ''
  }`;

  return (
    <div className="mt-4">
      <div className="relative">
        <svg
          role="img"
          aria-label={t('grapheAria', { depense: f.euro(depense), jour: jourMois(jE), suite })}
          viewBox={`0 0 ${jM} 100`}
          preserveAspectRatio="none"
          className="block h-44 w-full overflow-visible"
        >
          {[0.5, 1].map((k) => (
            <line
              key={k}
              x1={0}
              x2={jM}
              y1={y(max * k)}
              y2={y(max * k)}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="stroke-border"
            />
          ))}
          <line
            x1={0}
            x2={jM}
            y1={100}
            y2={100}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="stroke-muted-foreground"
          />
          <path
            d={`M0,100 L${pts.join(' L')} L${jE},100 Z`}
            fillOpacity={0.14}
            className="fill-serie-depenses"
            data-rythme="aire"
          />
          {aB && (
            <line
              x1={0}
              y1={100}
              x2={jM}
              y2={y(budget)}
              strokeWidth={1.5}
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
              className="stroke-muted-foreground"
              data-rythme="rythme"
            />
          )}
          {proj !== null && (
            <line
              x1={jE}
              y1={y(cumul(jE))}
              x2={jM}
              y2={y(proj)}
              strokeWidth={2}
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
              className="stroke-serie-depenses"
              data-rythme="projection"
            />
          )}
          <polyline
            points={pts.join(' ')}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-serie-depenses"
            data-rythme="cumul"
          />
          <line
            x1={jE}
            x2={jE}
            y1={y(cumul(jE)) - 5}
            y2={y(cumul(jE)) + 5}
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
            className="stroke-serie-depenses"
          />
        </svg>
        <div className={`absolute inset-0 grid ${GRILLE[jM] ?? 'grid-cols-31'}`}>
          {tranches.map(([a, b], i) => {
            const n = b - a + 1;
            // The last slice (3 or 4 days, or a lone one before the 5th) reaches
            // 44 px by extending over the days to come, which have no target.
            const span = i === tranches.length - 1 ? Math.min(Math.max(n, TRANCHE), jM - a + 1) : n;
            const tot = new Decimal(auServeur(b)).minus(auServeur(a - 1)).toNumber();
            const periode =
              a === b
                ? jourMois(a)
                : t('periode', { debut: f.numJour(year, month, a), fin: jourMois(b) });
            return (
              <button
                key={a}
                type="button"
                data-testid="rythme-tranche"
                aria-label={t('trancheAria', { periode, montant: f.euro(tot) })}
                title={`${periode} · ${f.centime(tot)}`}
                onClick={() => onTranche(a, b)}
                className={`${DEBUT[a]} ${ETENDUE[span] ?? 'col-span-7'} row-start-1 h-full min-h-11 ${
                  i > 0 ? 'border-border border-l' : ''
                } focus-visible:ring-brand-600 hover:bg-surface-muted/40 active:bg-surface-muted/60 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset`}
              />
            );
          })}
        </div>
      </div>
      <div
        aria-hidden
        data-testid="rythme-axe"
        className={`text-muted-foreground mt-1 grid ${GRILLE[jM] ?? 'grid-cols-31'} text-xs tabular-nums`}
      >
        {axe.map((j) => (
          <span key={j} className={`${DEBUT[j]} row-start-1 ${cale(j)} whitespace-nowrap`}>
            {repere(j)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Ligne({
  libelle,
  sous,
  montant,
  testId,
}: Readonly<{
  libelle: React.ReactNode;
  sous?: React.ReactNode;
  montant: string;
  testId?: string;
}>) {
  return (
    <div className="flex items-start justify-between gap-3 py-2" data-testid={testId}>
      <div className="min-w-0">
        <p className="text-sm">{libelle}</p>
        {sous && <p className="text-muted-foreground text-xs">{sous}</p>}
      </div>
      <span className="font-mono text-sm whitespace-nowrap tabular-nums">{montant}</span>
    </div>
  );
}

function Bloc({
  etiquette,
  children,
  testId,
}: Readonly<{ etiquette: string; children: React.ReactNode; testId?: string }>) {
  return (
    <section data-testid={testId}>
      <h3 className="text-muted-foreground border-border border-b pb-1 font-mono text-xs tracking-wide uppercase">
        {etiquette}
      </h3>
      <div className="divide-border divide-y">{children}</div>
    </section>
  );
}

/**
 * `g-jour` (a slice of days) and `g-rythme` (the month to date): the same
 * pieces — total, pace and gap at the end of the slice, then each day — and
 * `g-rythme` adds the projection and the budget with its source.
 */
function TiroirRythme(
  props: RythmeDuMoisProps & { jE: number; tiroir: Tiroir; onClose: () => void },
) {
  const { year, month, joursDuMois: jM, jE, serie, depenses, projection, tiroir, onClose } = props;
  const { a, b } = tiroir;
  const t = useTranslations('cockpit.rythme');
  const f = useFormats(props.decalage ?? 0);
  const jourMois = (d: number) => f.jourMois(year, month, d);
  const cumul = (j: number) => (j <= 0 ? 0 : (serie[j - 1]?.cumule ?? 0));
  const tot = new Decimal(cumul(b)).minus(cumul(a - 1)).toNumber();
  const budget = new Decimal(props.budget.montant);
  const r = rythmeAuJour(budget, b, jM);
  const ec = r ? ecartAuRythme(new Decimal(cumul(b)), r) : null;
  const titre =
    a === b ? jourMois(a) : t('periode', { debut: f.numJour(year, month, a), fin: jourMois(b) });
  const libTotal =
    a === b
      ? t('totalJour', { jour: jourMois(a) })
      : a === 1 && !horsDuMois(props)
        ? t('totalDepuis1er', { jour: jourMois(b) })
        : t('totalTranche', { debut: f.numJour(year, month, a), fin: jourMois(b) });
  const lignesDu = (j: number) => depenses.filter((d) => d.date === f.iso(year, month, j));
  const sens = ec ? sensDeLEcart(ec) : null;
  const b1 = props.budget;
  const postes: Array<[string, number]> = (
    [
      [t('factures'), b1.chargesFixes],
      [t('parts'), b1.provisionsLissees],
      [t('echeances'), b1.engagementsMensuels],
      [t('misDeCote'), b1.misDeCote],
    ] as Array<[string, number]>
  ).filter(([, v]) => v > 0);

  return (
    <Sheet
      open
      onClose={onClose}
      title={titre}
      closeLabel={t('fermer')}
      testId={tiroir.mois ? 'rythme-tiroir-mois' : 'rythme-tiroir-jour'}
    >
      <div className="space-y-5 pb-4">
        <Bloc etiquette={t('totalEtiquette')}>
          <Ligne
            testId="rythme-total"
            libelle={<strong>{libTotal}</strong>}
            montant={f.centime(tot)}
          />
        </Bloc>
        <Bloc etiquette={t('finEtiquette', { jour: jourMois(b) })}>
          {a !== 1 && (
            <Ligne
              libelle={t('cumuleDepuis1er')}
              sous={t('sourceOperations')}
              montant={f.centime(cumul(b))}
            />
          )}
          {r && ec && sens ? (
            <>
              <Ligne
                testId="rythme-rythme"
                libelle={t('rythmeBudget')}
                sous={t('rythmeOp', { budget: f.centime(budget.toNumber()), jour: b, jours: jM })}
                montant={f.centime(r.toNumber())}
              />
              <Ligne
                testId="rythme-ecart"
                libelle={
                  sens === 'pile'
                    ? t('sensPile')
                    : sens === 'marge'
                      ? t('sensMarge')
                      : t('sensDessus')
                }
                sous={
                  ec.lte(0)
                    ? t('opEcartMarge', {
                        rythme: f.centime(r.toNumber()),
                        depense: f.centime(cumul(b)),
                        ecart: f.centime(ec.abs().toNumber()),
                      })
                    : t('opEcartDessus', {
                        rythme: f.centime(r.toNumber()),
                        depense: f.centime(cumul(b)),
                        ecart: f.centime(ec.abs().toNumber()),
                      })
                }
                montant={f.centime(ec.abs().toNumber())}
              />
            </>
          ) : (
            <p className="text-muted-foreground py-2 text-sm">{t('sansRythme')}</p>
          )}
        </Bloc>
        {tiroir.mois && jE < jM && projection !== null && (
          <Bloc etiquette={t('projectionEtiquette')} testId="rythme-projection">
            <Ligne
              libelle={t('depenseAu', { jour: jourMois(jE) })}
              sous={t('sourceOperations')}
              montant={f.centime(props.depensesDuMois)}
            />
            <Ligne
              libelle={<strong>{t('projectionAu', { jour: jourMois(jM) })}</strong>}
              sous={t('projectionOp', {
                depense: f.centime(props.depensesDuMois),
                jours: jM,
                ecoules: jE,
              })}
              montant={f.centime(projection)}
            />
          </Bloc>
        )}
        {tiroir.mois && (
          <Bloc etiquette={t('budgetEtiquette')} testId="rythme-budget">
            <Ligne
              libelle={b1.revenuPrevu ? t('revenuPrevu') : t('revenus')}
              montant={f.centime(b1.revenus)}
            />
            {postes.map(([lib, v]) => (
              <Ligne key={lib} libelle={lib} montant={f.moins(v)} />
            ))}
            <Ligne libelle={<strong>{t('budgetTotal')}</strong>} montant={f.centime(b1.montant)} />
            <p className="text-muted-foreground py-2 text-xs">
              <NoteBudget budget={b1} />
            </p>
          </Bloc>
        )}
        <Bloc etiquette={t('joursEtiquette')}>
          {Array.from({ length: b - a + 1 }, (_, k) => a + k).map((j) => {
            const ls = lignesDu(j);
            const duJour = serie[j - 1]?.duJour ?? 0;
            return (
              <div key={j} className="py-2">
                <p className="text-sm font-semibold">
                  {jourMois(j)}
                  {ls.length > 0 && (
                    <span className="font-mono tabular-nums"> · {f.centime(duJour)}</span>
                  )}
                </p>
                {ls.length ? (
                  ls.map((l) => (
                    <Ligne key={l.id} libelle={l.label} montant={f.centime(l.montant)} />
                  ))
                ) : (
                  <p className="text-muted-foreground text-xs">{t('aucuneDepenseJour')}</p>
                )}
              </div>
            );
          })}
        </Bloc>
      </div>
    </Sheet>
  );
}
