'use client';

import { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Sheet } from '@/components/primitives/Sheet';
import { Repli } from '@/components/cockpit/Repli';
import { getSixMoisAction } from '@/lib/actions/six-mois';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import type { SixMoisMois } from '@/lib/actions/six-mois.types';
import type { Locale } from '@/i18n/routing';
import { formatCurrency, formatMonth } from '@/lib/i18n/formatters';

/**
 * « Six mois » (G-six) and its drawer `g-mois` — the mockup's `carteSixMois`
 * and `TIROIRS_PAGES['g-mois']` (docs/retours/prototype, graphiques.js).
 *
 * The fold is closed by default and reads its six months when it OPENS, on
 * every opening (@thierry, 26 Sept. 2026): the figures move from other
 * screens, so a copy kept from a first opening would go stale.
 *
 * Every amount arrives computed (`getSixMoisAction`, domain `six-mois.ts`):
 * this file adds nothing up. It only scales the bars, whose widths say no
 * figure the text does not already write.
 *
 * At 375 px the row is compact — month, bar, total, chevron — and its series
 * line is hidden; the series stay in the accessible name, in the `title`
 * bubble and in the drawer (COUVERTURE-v3, table B). From `lg` the row shows
 * them. No `style` attribute anywhere (CSP): the bars are SVG attributes.
 */

type Fin = Readonly<{ year: number; month: number }>;
type Etat =
  | { phase: 'ferme' }
  | { phase: 'chargement' }
  | { phase: 'erreur' }
  | { phase: 'pret'; mois: SixMoisMois[] };

export function SixMoisRepli({ fin }: Readonly<{ fin: Fin }>) {
  const t = useTranslations('cockpit.sixMois');
  const tr = useTranslations('cockpit.replis');
  const [etat, setEtat] = useState<Etat>({ phase: 'ferme' });
  const [ouvertSur, setOuvertSur] = useState<SixMoisMois | null>(null);
  const demande = useRef(0);

  const lire = async () => {
    const n = ++demande.current;
    setEtat({ phase: 'chargement' });
    let res: Awaited<ReturnType<typeof getSixMoisAction>> | null = null;
    try {
      res = await getSixMoisAction({ year: fin.year, month: fin.month });
    } catch (err) {
      // A redirect to /login or /login/2fa must reach Next, never read as a failed read.
      if (isNextControlFlowError(err)) throw err;
    }
    if (n !== demande.current) return;
    setEtat(res && res.ok ? { phase: 'pret', mois: res.data.mois } : { phase: 'erreur' });
  };

  return (
    <Repli
      titre={tr('sixMois')}
      // No key this turn (@thierry, 26 Sept. 2026): « le plus serré » needs the six
      // months' « Il te reste » and a threshold that is a product rule, decided apart.
      cle=""
      testId="repli-six-mois"
      onToggle={(ouvert) => {
        if (ouvert) void lire();
      }}
    >
      {etat.phase === 'chargement' && (
        <p className="text-muted-foreground text-sm" aria-busy="true">
          <span className="bg-surface-muted block h-40 w-full animate-pulse rounded-md motion-reduce:animate-none" />
          <span className="sr-only">{t('chargement')}</span>
        </p>
      )}
      {etat.phase === 'erreur' && (
        <p role="alert" className="text-sm">
          {t('erreur')}
        </p>
      )}
      {etat.phase === 'pret' && <CarteSixMois mois={etat.mois} onOuvrir={(m) => setOuvertSur(m)} />}
      {ouvertSur && <TiroirMois mois={ouvertSur} onClose={() => setOuvertSur(null)} />}
    </Repli>
  );
}

function useFormats() {
  const locale = useLocale() as Locale;
  const euros = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return {
    locale,
    euro: (v: number) => euros.format(v),
    centime: (v: number) => formatCurrency(v, locale),
    moisAn: (m: SixMoisMois) => `${formatMonth(m.month, locale)} ${m.year}`,
    moisCourt: (m: SixMoisMois) => formatMonth(m.month, locale, 'short'),
    jourMois: (iso: string) =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Brussels',
      }).format(new Date(iso)),
  };
}

/** The month's status and its series in words — the card's hidden line, the bubble and the accessible name. */
function useLibelles() {
  const t = useTranslations('cockpit.sixMois');
  const { euro } = useFormats();
  return {
    statut: (m: SixMoisMois) =>
      m.statut === 'en-cours' ? t('enCours') : m.statut === 'a-venir' ? t('aVenir') : '',
    series: (m: SixMoisMois) => [
      t('serieFactures', { montant: euro(m.factures.total) }),
      m.depenses === null
        ? t('serieDepensesAVenir')
        : t('serieDepenses', { montant: euro(m.depenses.total) }),
      m.provisions.net < 0
        ? t('serieReprise', { montant: euro(-m.provisions.net) })
        : t('serieProvisions', { montant: euro(m.provisions.net) }),
    ],
  };
}

const pile = (m: SixMoisMois) =>
  m.factures.total + Math.max(0, m.depenses?.total ?? 0) + Math.max(0, m.provisions.net);

function CarteSixMois({
  mois,
  onOuvrir,
}: Readonly<{ mois: SixMoisMois[]; onOuvrir: (m: SixMoisMois) => void }>) {
  const t = useTranslations('cockpit.sixMois');
  const f = useFormats();
  const lib = useLibelles();
  const vide = mois.every(
    (m) => !m.factures.lignes.length && !m.depenses?.lignes.length && m.provisions.net === 0,
  );
  if (vide) {
    return (
      <div>
        <p className="text-sm font-medium">{t('vide')}</p>
        <p className="text-muted-foreground text-sm">{t('videDetail')}</p>
      </div>
    );
  }
  const etendue = Math.max(0, ...mois.map(pile));
  const reprise = mois.some((m) => m.provisions.net < 0);
  return (
    <div data-surface="G-six">
      <ol className="divide-border divide-y">
        {mois.map((m) => {
          const statut = lib.statut(m);
          const series = lib.series(m);
          const aria = t('aria', {
            mois: f.moisAn(m),
            statut: statut ? `, ${statut}` : '',
            auMoins: m.auMoins ? `${t('auMoins')} ` : '',
            total: f.euro(m.total),
            series: series.join(', '),
          });
          return (
            <li key={`${m.year}-${m.month}`}>
              <button
                type="button"
                data-testid="six-mois-rangee"
                aria-label={aria}
                title={[`${f.moisAn(m)}${statut ? ` · ${statut}` : ''}`, ...series].join('\n')}
                onClick={() => onOuvrir(m)}
                className="focus-visible:ring-brand-600 active:bg-surface-muted grid min-h-11 w-full grid-cols-[4.5rem_minmax(0,1fr)_auto_1rem] items-center gap-x-2 gap-y-1 rounded-md py-3 text-left focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="text-base leading-6 whitespace-nowrap">
                  {f.moisCourt(m)}
                  {statut && (
                    <span className="text-muted-foreground block text-xs leading-4">{statut}</span>
                  )}
                </span>
                <BarreMois m={m} etendue={etendue} />
                <span className="flex flex-col items-end font-mono text-base leading-6 whitespace-nowrap tabular-nums">
                  {m.auMoins && (
                    <span className="text-muted-foreground font-sans text-xs leading-4">
                      {t('auMoins')}
                    </span>
                  )}
                  {f.euro(m.total)}
                </span>
                <ChevronRight aria-hidden strokeWidth={1.5} className="h-4 w-4" />
                <span
                  className="text-muted-foreground col-span-4 hidden text-xs leading-4 lg:block"
                  data-six-mois-series
                >
                  {series.join(' · ')}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Cle classe="bg-serie-factures">{t('legendeFactures')}</Cle>
        <Cle classe="bg-serie-depenses">{t('legendeDepenses')}</Cle>
        <Cle classe="bg-serie-provisions">{t('legendeProvisions')}</Cle>
        {reprise && (
          <Cle classe="border-serie-provisions border-[1.5px] border-dashed">
            {t('legendeReprise')}
          </Cle>
        )}
      </ul>
    </div>
  );
}

function Cle({ classe, children }: Readonly<{ classe: string; children: React.ReactNode }>) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${classe}`} />
      {children}
    </li>
  );
}

/**
 * One month's stacked bar, on the scale of the six: bills, spending, then
 * provisions — positive parts only. A reprise is drawn as a dashed outline
 * over the part of the pile the provisions take back (mockup `barreSixMoisG`).
 */
function BarreMois({ m, etendue }: Readonly<{ m: SixMoisMois; etendue: number }>) {
  const k = (v: number) => (etendue > 0 ? (100 * v) / etendue : 0);
  const parts = [
    { cle: 'fac', v: m.factures.total, classe: 'fill-serie-factures' },
    { cle: 'dep', v: m.depenses?.total ?? 0, classe: 'fill-serie-depenses' },
    { cle: 'ep', v: m.provisions.net, classe: 'fill-serie-provisions' },
  ].filter((p) => p.v > 0);
  let x = 0;
  const rects = parts.map((p) => {
    const r = { ...p, x, w: k(p.v) };
    x += r.w;
    return r;
  });
  const haut = m.factures.total + Math.max(0, m.depenses?.total ?? 0);
  const nu = Math.max(0, m.total);
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 12"
      preserveAspectRatio="none"
      className="h-3 w-full min-w-0"
      data-six-mois-barre
    >
      {rects.map((r) => (
        <rect
          key={r.cle}
          x={r.x}
          y={0}
          width={Math.max(0, r.w - 0.6)}
          height={12}
          rx={0.8}
          className={r.classe}
          data-part={r.cle}
        />
      ))}
      {m.provisions.net < 0 && haut > nu && (
        <rect
          x={k(nu)}
          y={0.75}
          width={Math.max(0.5, k(haut - nu) - 0.6)}
          height={10.5}
          className="stroke-serie-provisions fill-none"
          strokeWidth={1.5}
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
          data-part="reprise"
        />
      )}
    </svg>
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

function TitreGroupe({
  nom,
  montant,
  classe,
  sous,
}: Readonly<{ nom: string; montant: string; classe: string; sous?: string }>) {
  return (
    <>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${classe}`} />
        <span className="flex-1">{nom}</span>
        <span className="font-mono tabular-nums">{montant}</span>
      </h3>
      {sous && <p className="text-muted-foreground text-xs">{sous}</p>}
    </>
  );
}

function TiroirMois({ mois: m, onClose }: Readonly<{ mois: SixMoisMois; onClose: () => void }>) {
  const t = useTranslations('cockpit.sixMois');
  const f = useFormats();
  const statut = useLibelles().statut(m);
  const signe = (v: number) =>
    v > 0 ? `+${f.centime(v)}` : v < 0 ? `−${f.centime(-v)}` : f.centime(0);
  const reprise = m.provisions.net < 0;
  const operation = [
    t('opFactures', { montant: f.centime(m.factures.total) }),
    m.depenses === null
      ? t('opDepensesAVenir')
      : t('opDepenses', { montant: f.centime(m.depenses.total) }),
    reprise
      ? t('opReprise', { montant: f.centime(-m.provisions.net) })
      : t('opProvisions', { montant: f.centime(m.provisions.net) }),
    `${t('opTotal', { montant: f.centime(m.total) })}${m.auMoins ? t('opAuMoins') : ''}`,
  ].join(' ');

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${f.moisAn(m)}${statut ? ` · ${statut}` : ''}`}
      closeLabel={t('fermer')}
      testId="six-mois-tiroir"
    >
      <div className="space-y-5 pb-4">
        <div>
          <Ligne
            testId="six-mois-total"
            libelle={<strong>{m.auMoins ? t('totalAuMoins') : t('total')}</strong>}
            sous={t('calcule')}
            montant={f.centime(m.total)}
          />
          <Ligne
            libelle={t('ecart')}
            montant={
              m.ecartMoisPrecedent === null ? t('nonComparable') : signe(m.ecartMoisPrecedent)
            }
          />
        </div>

        <section>
          <TitreGroupe
            nom={t('factures')}
            montant={f.centime(m.factures.total)}
            classe="bg-serie-factures"
            sous={t('calcule')}
          />
          {m.factures.paiementsNonEnregistres && (
            <p className="text-muted-foreground mt-1 text-sm">{t('paiementsNonEnregistres')}</p>
          )}
          {m.factures.lignes.length ? (
            <div className="divide-border divide-y">
              {m.factures.lignes.map((l) => {
                const etat = l.payee
                  ? l.payeeLe
                    ? t('payeeLe', { date: f.jourMois(l.payeeLe) })
                    : t('payeeSansDate')
                  : '';
                const sous = [
                  t('leJour', { jour: l.jour }),
                  l.echeance ? t('echeance', l.echeance) : '',
                  etat,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Ligne key={l.id} libelle={l.label} sous={sous} montant={f.centime(l.montant)} />
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t('aucuneFacture')}</p>
          )}
        </section>

        <section>
          {m.depenses === null ? (
            <p className="text-muted-foreground text-sm">
              {t('depensesAVenir', { mois: f.moisAn(m) })}
            </p>
          ) : (
            <>
              <TitreGroupe
                nom={t('depenses')}
                montant={f.centime(m.depenses.total)}
                classe="bg-serie-depenses"
                sous={t('depensesSource')}
              />
              {m.depenses.lignes.length ? (
                <div className="divide-border divide-y">
                  {m.depenses.lignes.map((l) => (
                    <Ligne
                      key={l.id}
                      libelle={l.label}
                      sous={f.jourMois(`${l.date}T12:00:00Z`)}
                      montant={f.centime(l.montant)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t('aucuneDepense')}</p>
              )}
            </>
          )}
        </section>

        <section>
          <TitreGroupe
            nom={t('provisions')}
            montant={reprise ? signe(m.provisions.net) : f.centime(m.provisions.net)}
            classe="bg-serie-provisions"
            sous={reprise ? t('provisionsReprise') : t('provisionsVers')}
          />
          <p className="text-muted-foreground mt-1 text-sm">
            {t('provisionsOp', {
              cible: f.centime(m.provisions.cible),
              factures: f.centime(m.provisions.facturesDues),
              net: signe(m.provisions.net),
            })}
          </p>
        </section>

        <section>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('operation')}
          </p>
          <p className="text-sm">{operation}</p>
        </section>
      </div>
    </Sheet>
  );
}
