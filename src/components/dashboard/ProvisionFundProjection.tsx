import type { MoisDuFonds } from '@/lib/domain/cockpit';
import { formatCurrency, formatMonth } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';

export type ProvisionFundProjectionLabels = {
  toggle: string;
  title: string;
  intro: string;
  month: string;
  out: string;
  balance: string;
  /** Already interpolated by the caller — « En mars 2027, le fonds passe sous zéro. » */
  verdict: string;
  negative: string;
};

type Props = {
  projection: readonly MoisDuFonds[];
  labels: ProvisionFundProjectionLabels;
  locale: Locale;
};

/**
 * « Est-ce que mon fonds tient jusqu'à la prochaine grosse facture ? »
 *
 * The gauge next door answers « à jour » TODAY. This answers the question the
 * smoothing actually raises, using the accumulator that was missing:
 * `solde = solde + lissé − sortie`, iterated over 12 months
 * (`projeterFondsProvision`).
 *
 * ## Why a list and not a curve
 *
 * The prototype draws an SVG line. At 390 px, twelve months of a line chart is
 * a shape, not a reading — and the number the user needs is « in March the fund
 * goes under », which a line makes you estimate off an axis. Twelve rows
 * `mois · sortie · solde`, negatives in `danger`, say it outright. The
 * prototype's own table (l. 793-803) is more legible than its graph.
 *
 * ## Disclosure, not a modal
 *
 * `<details>` rather than a Sheet: this is a PROOF behind an aggregate, and the
 * Sheet primitive is reserved for an ACTION (§7). It also satisfies the drilling
 * rule — every displayed aggregate is tappable and leads to what composes it.
 *
 * ## Why it takes labels rather than calling `getTranslations`
 *
 * It would then be an async component, and an async component nested inside
 * another async component cannot be rendered by the parent's existing test
 * harness — React refuses it outside a full server render. Presentational and
 * synchronous, it stays testable from the card that already awaits its own
 * translations.
 */
export function ProvisionFundProjection({ projection, labels, locale }: Props) {
  const fmt = (v: MoisDuFonds['solde']) => formatCurrency(v, locale);

  return (
    <details className="mt-4" data-testid="provision-fund-projection">
      <summary className="text-brand-text hover:text-brand-text-strong focus-visible:ring-brand-600 flex min-h-11 cursor-pointer list-none items-center rounded text-sm font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none">
        {labels.toggle}
      </summary>

      <p className="text-foreground mt-2 text-sm font-medium" data-testid="provision-fund-verdict">
        {labels.verdict}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{labels.intro}</p>

      {/* The wide row scrolls inside its own container — the page body never
          scrolls horizontally at 390 px. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm" data-testid="provision-fund-table">
          <caption className="sr-only">{labels.title}</caption>
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th scope="col" className="py-1 font-medium">
                {labels.month}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {labels.out}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {labels.balance}
              </th>
            </tr>
          </thead>
          <tbody className="divide-border/60 divide-y">
            {projection.map((m) => {
              const negative = m.solde.lt(0);
              return (
                <tr
                  key={`${m.year}-${m.month}`}
                  data-testid={`provision-fund-row-${m.year}-${m.month}`}
                  data-negative={negative ? 'true' : 'false'}
                >
                  <th
                    scope="row"
                    className="text-foreground py-1.5 text-left font-normal capitalize"
                  >
                    {formatMonth(m.month, locale, 'short')} {m.year}
                  </th>
                  <td className="text-muted-foreground py-1.5 text-right tabular-nums">
                    {m.sortie.isZero() ? '—' : fmt(m.sortie)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold tabular-nums ${
                      negative ? 'text-danger' : 'text-foreground'
                    }`}
                  >
                    {fmt(m.solde)}
                    {negative && <span className="sr-only"> {labels.negative}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
