'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Sheet } from '@/components/primitives/Sheet';
import type { Locale } from '@/i18n/routing';
import { groupExpensesByDescription } from '@/lib/domain/expenses/group-by-description';
import { formatCurrency, formatDate, formatMonthInSentence } from '@/lib/i18n/formatters';

import { CATEGORY_DOT, CATEGORY_TEXT } from './category-colors';

/**
 * « Catégories » (G-cat) and its drawer `g-cat` — the mockup's
 * `carteCategories` and `TIROIRS_PAGES['g-cat']` (docs/retours/prototype,
 * graphiques.js). It replaces the « Dépensé ce mois » card of the Expenses
 * page: the same total, whose composition now opens category by category, and
 * the « ≈ X / day » line kept under it (COUVERTURE-v3, D2).
 *
 * Every amount arrives computed on the server (`categoriesDuMois`, which reads
 * `summarizeExpenses`): this file adds nothing up. It only scales the bars and
 * the 100 % column, whose widths say no figure the text does not already
 * write, and the drawer groups a category's rows by description with the
 * existing `groupExpensesByDescription`. No `style` attribute (CSP): bars are
 * SVG attributes, coloured through `currentColor`.
 */

export type CategorieCarte = Readonly<{
  /** null: the expenses filed under no category. */
  id: string | null;
  nom: string | null;
  couleur: string | null;
  total: number;
  lignes: ReadonlyArray<Readonly<{ id: string; label: string; montant: number; date: string }>>;
}>;

export type CategoriesCardProps = Readonly<{
  /** The month total, server-side and authoritative (`totalAmount(monthlyExpenses)`). */
  total: number;
  /** « ≈ X / day » over the elapsed days, as the former card wrote it; null on day 0. */
  parJour: number | null;
  joursEcoules: number;
  month: number;
  groupes: ReadonlyArray<CategorieCarte>;
}>;

/** Below lg, the first three categories; the others open on the spot (mockup `replier: 3`). */
const REPLIER = 3;

const cle = (g: CategorieCarte) => g.id ?? '—sans—';

export function CategoriesCard({
  total,
  parJour,
  joursEcoules,
  month,
  groupes,
}: CategoriesCardProps) {
  const t = useTranslations('app.expenses.categories');
  const tp = useTranslations('app.expenses');
  const locale = useLocale() as Locale;
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [deplie, setDeplie] = useState(false);

  const euro = (v: number) => formatCurrency(v, locale);
  const mois = formatMonthInSentence(month, locale);
  const nom = (g: CategorieCarte) => g.nom ?? t('sansCategorie');
  const part = (g: CategorieCarte) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
      total > 0 ? g.total / total : 0,
    );
  const plier = groupes.length > REPLIER;
  const choisi = ouvert === null ? null : (groupes.find((g) => cle(g) === ouvert) ?? null);

  // The 100 % column: one segment per positive group, in the list's order.
  const positifs = groupes.filter((g) => g.total > 0);
  const largeur = (g: CategorieCarte) => (total > 0 ? (g.total / total) * 100 : 0);
  const segments = positifs.map((g, i) => ({
    g,
    x: positifs.slice(0, i).reduce((s, p) => s + largeur(p), 0),
    w: largeur(g),
  }));

  return (
    <section
      data-testid="categories-card"
      data-surface="G-cat"
      aria-labelledby="t-G-cat"
      className="bg-card text-card-foreground border-border rounded-xl border p-4 shadow-sm md:p-6"
    >
      <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
        {t('etiquette')}
      </p>
      <h2 id="t-G-cat" className="sr-only">
        {t('titre', { month: mois })}
      </h2>
      {groupes.length === 0 ? (
        <div className="mt-2">
          <p className="text-sm font-medium" data-testid="depense-mois-total">
            {t('vide', { month: mois })}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">{t('videAide')}</p>
        </div>
      ) : (
        <>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <strong
              className="text-foreground font-mono text-3xl font-semibold tracking-tight tabular-nums"
              data-testid="depense-mois-total"
              data-total={total}
            >
              {euro(total)}
            </strong>
            <span className="text-muted-foreground text-sm">
              {t('depensesEn', { month: mois })}
            </span>
          </p>
          {parJour !== null && (
            <p
              className="text-muted-foreground mt-1 text-xs tabular-nums"
              data-testid="depense-mois-perday"
            >
              {tp('perDayElapsed', { amount: euro(parJour), days: joursEcoules })}
            </p>
          )}
          <svg
            aria-hidden="true"
            focusable="false"
            className="mt-3 block h-2 w-full"
            viewBox="0 0 100 2"
            preserveAspectRatio="none"
          >
            {segments.map(({ g, x: sx, w }) => (
              <rect
                key={cle(g)}
                x={sx}
                y={0}
                width={Math.max(0, w - 0.4)}
                height={2}
                fill="currentColor"
                className={CATEGORY_TEXT[g.couleur ?? 'zinc'] ?? CATEGORY_TEXT.zinc}
              />
            ))}
          </svg>
          <ol id="l-G-cat" className="mt-2">
            {groupes.map((g, i) => (
              <li
                key={cle(g)}
                className={[
                  'border-border border-b last:border-b-0',
                  plier && !deplie && i >= REPLIER ? 'max-lg:hidden' : '',
                ].join(' ')}
              >
                <button
                  type="button"
                  data-testid="g-cat-ligne"
                  data-total={g.total}
                  onClick={() => setOuvert(cle(g))}
                  aria-label={t('ligneAria', {
                    nom: nom(g),
                    montant: euro(g.total),
                    nb: t('nbDepenses', { count: g.lignes.length }),
                  })}
                  className="focus-visible:ring-brand-600 hover:bg-muted relative grid min-h-11 w-full grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-1 rounded-md py-2 pr-7 text-left focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span
                      aria-hidden="true"
                      className={[
                        'inline-block h-2.5 w-2.5 shrink-0 self-center rounded-full',
                        CATEGORY_DOT[g.couleur ?? 'zinc'] ?? CATEGORY_DOT.zinc,
                      ].join(' ')}
                    />
                    <span className="truncate font-medium">{nom(g)}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t('nbDepenses', { count: g.lignes.length })}
                    </span>
                  </span>
                  <span className="text-right font-mono text-sm font-semibold tabular-nums">
                    {euro(g.total)}
                  </span>
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    className="text-muted col-start-1 block h-1.5 w-full"
                    viewBox="0 0 100 2"
                    preserveAspectRatio="none"
                  >
                    <rect x={0} y={0} width={100} height={2} rx={1} fill="currentColor" />
                    <rect
                      x={0}
                      y={0}
                      width={total > 0 ? Math.min(100, (g.total / total) * 100) : 0}
                      height={2}
                      rx={1}
                      fill="currentColor"
                      className={CATEGORY_TEXT[g.couleur ?? 'zinc'] ?? CATEGORY_TEXT.zinc}
                    />
                  </svg>
                  <span className="text-muted-foreground text-right font-mono text-xs tabular-nums">
                    {part(g)}
                  </span>
                  <ChevronRight
                    aria-hidden
                    strokeWidth={1.5}
                    className="absolute top-1/2 right-0 h-5 w-5 -translate-y-1/2"
                  />
                </button>
              </li>
            ))}
          </ol>
          {plier && (
            <button
              type="button"
              data-testid="g-cat-replier"
              aria-expanded={deplie}
              aria-controls="l-G-cat"
              onClick={() => setDeplie((v) => !v)}
              className="text-brand-text mt-1 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 lg:hidden"
            >
              {deplie ? t('reduire') : t('autres', { count: groupes.length - REPLIER })}
            </button>
          )}
        </>
      )}
      {choisi && (
        <Sheet
          open
          onClose={() => setOuvert(null)}
          title={t('tiroirTitre', { nom: nom(choisi), month: mois })}
          closeLabel={t('fermer')}
          testId="g-cat-tiroir"
        >
          <TiroirCategorie groupe={choisi} euro={euro} locale={locale} />
        </Sheet>
      )}
    </section>
  );
}

function TiroirCategorie({
  groupe,
  euro,
  locale,
}: Readonly<{ groupe: CategorieCarte; euro: (v: number) => string; locale: Locale }>) {
  const t = useTranslations('app.expenses.categories');
  const dot = CATEGORY_DOT[groupe.couleur ?? 'zinc'] ?? CATEGORY_DOT.zinc;
  // By description (DESIGN-v3 rule 26: the description says where, the
  // category says what for) — the existing grouping, not a new one.
  const parDescription = groupExpensesByDescription(
    groupe.lignes.map((l) => ({ ...l, amount: l.montant, occurredOn: l.date })),
  );
  return (
    <div className="space-y-5 pb-4">
      <div
        data-testid="g-cat-total"
        data-total={groupe.total}
        className="flex items-start justify-between gap-3"
      >
        <div>
          <p className="font-semibold">{t('tiroirTotal')}</p>
          <p className="text-muted-foreground text-xs">
            {t('tiroirSous', { nb: t('nbDepenses', { count: groupe.lignes.length }) })}
          </p>
        </div>
        <p className="font-mono text-lg font-semibold tabular-nums">{euro(groupe.total)}</p>
      </div>
      {parDescription.map((d) => (
        <div key={d.key} data-groupe="description">
          <h3
            className="flex items-center gap-2 font-mono text-xs tracking-wide uppercase"
            data-sous-total={d.subtotal.toNumber()}
          >
            <span
              aria-hidden="true"
              className={['h-2.5 w-2.5 shrink-0 rounded-full', dot].join(' ')}
            />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            <span className="text-sm font-semibold tabular-nums">
              {euro(d.subtotal.toNumber())}
            </span>
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t('nbDepenses', { count: d.items.length })}
          </p>
          <ul className="mt-1">
            {d.items.map((l) => (
              <li
                key={l.id}
                data-testid="g-cat-operation"
                className="border-border flex min-h-11 items-center justify-between gap-3 border-b last:border-b-0"
              >
                <span className="text-sm">{formatDate(l.date, locale, 'medium')}</span>
                <span className="font-mono text-sm tabular-nums">{euro(l.montant)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
