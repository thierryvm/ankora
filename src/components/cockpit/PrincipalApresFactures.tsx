import { ChevronDown } from 'lucide-react';

import type { Locale } from '@/i18n/routing';
import { formatCurrency } from '@/lib/i18n/formatters';

/**
 * « Sur ton compte principal après tes factures de <mois> » — the last line of
 * the transfer fold.
 *
 * The figure is `principalApresFactures()` (domain): the main account's computed
 * balance minus the bills and instalments of the month still unpaid. It opens
 * on exactly those terms (rule 10): the balance, each line still due, then the
 * result. Nothing is added up here — the page hands over the domain's lines and
 * its result, converted to numbers at the RSC boundary.
 *
 * `<details>` with the summary classes of `CascadeDuMois`: a proof behind a
 * figure, not an action, so no Sheet (same reasoning as
 * `ProvisionFundProjection`). Synchronous and fed with labels, like the latter,
 * so it renders in a plain test without a server harness.
 *
 * No balance (no statement on the main account): the line keeps its place and
 * says so. Never « 0 € ».
 */
export type PrincipalApresFacturesDetail = Readonly<{
  solde: number;
  montant: number;
  lignes: readonly Readonly<{
    id: string;
    label: string;
    montant: number;
    /** When it falls due, already worded by the page (« le 5 », « le 20 · échéance 5/24 »). */
    quand: string;
  }>[];
}>;

export type PrincipalApresFacturesLabels = Readonly<{
  titre: string;
  /** Accessible name of the summary. */
  toggle: string;
  solde: string;
  resultat: string;
  /** Shown instead of a figure when the balance is unknown. */
  absence: string;
}>;

export function PrincipalApresFactures({
  detail,
  labels,
  locale,
}: Readonly<{
  detail: PrincipalApresFacturesDetail | null;
  labels: PrincipalApresFacturesLabels;
  locale: Locale;
}>) {
  const fmt = (v: number) => formatCurrency(v, locale);

  if (detail === null) {
    return (
      <div className="py-2" data-testid="principal-apres-factures">
        <p className="text-sm font-medium">{labels.titre}</p>
        <p
          className="text-muted-foreground mt-1 text-xs"
          data-testid="principal-apres-factures-absent"
        >
          {labels.absence}
        </p>
      </div>
    );
  }

  const tone = detail.montant >= 0 ? 'text-success' : 'text-danger';
  // `whitespace-nowrap`: an amount is one unit, its sign never wraps away.
  const amountClass = 'shrink-0 whitespace-nowrap font-mono tabular-nums';

  return (
    <details className="group py-2" data-testid="principal-apres-factures">
      <summary className="focus-visible:ring-brand-600 flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded focus-visible:ring-2 focus-visible:outline-none">
        <span className="min-w-0 text-sm font-medium">{labels.titre}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={`${amountClass} text-sm ${tone}`}
            data-testid="principal-apres-factures-montant"
          >
            {fmt(detail.montant)}
          </span>
          <ChevronDown
            aria-hidden
            className="text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
          <span className="sr-only">{labels.toggle}</span>
        </span>
      </summary>

      <ul className="mt-1 mb-1 flex flex-col gap-2 text-xs">
        <li
          className="flex items-baseline justify-between gap-2"
          data-testid="principal-apres-factures-solde"
        >
          <span className="text-foreground min-w-0">{labels.solde}</span>
          <span className={`${amountClass} text-foreground`}>{fmt(detail.solde)}</span>
        </li>
        {detail.lignes.map((ligne) => (
          <li key={ligne.id} data-testid="principal-apres-factures-ligne">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-foreground min-w-0">{ligne.label}</span>
              <span className={`${amountClass} text-foreground`}>− {fmt(ligne.montant)}</span>
            </div>
            <p className="text-muted-foreground mt-0.5">{ligne.quand}</p>
          </li>
        ))}
        <li
          className="border-border flex items-baseline justify-between gap-2 border-t pt-2 font-semibold"
          data-testid="principal-apres-factures-resultat"
        >
          <span className="text-foreground min-w-0">{labels.resultat}</span>
          <span className={`${amountClass} ${tone}`}>{fmt(detail.montant)}</span>
        </li>
      </ul>
    </details>
  );
}
