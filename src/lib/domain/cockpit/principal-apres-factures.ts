import Decimal from 'decimal.js';

import type { ReferencePeriod } from '@/lib/domain/cockpit/types';
import type { MonthObligation, ObligationSource } from '@/lib/domain/obligations/types';

/**
 * « Sur ton compte principal après tes factures de <mois> ».
 *
 * ## Why this replaces « Après tes sorties »
 *
 * The transfer fold used to end on `netPrincipalAfterPlan`: the PLANNED income,
 * minus the daily allowance, the provisions, and every bill and instalment of
 * the month — paid or not. None of its terms was on the person's account, so
 * the figure could not be checked against anything, and the bills it
 * subtracted were not the ones the screen names (`principalBillsDue` holds
 * non-monthly bills at their full amount in their due month; cf. the test
 * « principalBillsDue vs the monthly bills » in `transfer.test.ts`).
 *
 * This figure starts from what is there: the main account's balance as the
 * Accounts page computes it (latest statement + operations since). A bill or an
 * instalment ticked paid ALWAYS leaves the main account (`income_bills`,
 * ADR-045 D22, `accounts/debits.ts`), so that balance already went down with
 * every paid one. What remains to leave it is exactly the obligations of the
 * month still unticked — the same list the bills screen ticks.
 *
 *     montant = solde − Σ obligations non payées
 *
 * ## The decomposition travels with the figure (rule 10)
 *
 * `lignes` are the very terms `aPayer` sums, and `montant` is computed from
 * them here. The screen lists them; it never adds them up again.
 *
 * ## No balance, no figure
 *
 * Without any statement on the main account, its balance is unknown. The
 * function then returns `null` — never a figure built on 0 €, which would read
 * as « your account is empty ».
 *
 * Pure: `decimal.js` and domain types only.
 */

export type LignePrincipal = Readonly<{
  id: string;
  source: ObligationSource;
  label: string;
  montant: Decimal;
  /** Day of the month it falls due, clamped to the month's last day. */
  jour: number;
  /** « échéance 5/24 » for an instalment, `null` for a bill. */
  rang: Readonly<{ index: number; total: number }> | null;
}>;

export type PrincipalApresFactures = Readonly<{
  /** The main account's computed balance, the starting point. */
  solde: Decimal;
  /** What is still to pay this month, line by line, in the list's order. */
  lignes: readonly LignePrincipal[];
  /** Σ `lignes`. */
  aPayer: Decimal;
  /** `solde − aPayer`. Negative: the bills still due exceed the balance. */
  montant: Decimal;
}>;

export function principalApresFactures(input: {
  /** `null` when the main account has no statement: nothing can be said. */
  soldePrincipal: Decimal | null;
  /** The month's obligations, paid and unpaid (`obligationsDuMois`). */
  obligations: readonly MonthObligation[];
  /** The month they fall due in — a day 31 reads « le 30 » in September. */
  ref: ReferencePeriod;
}): PrincipalApresFactures | null {
  const { soldePrincipal, obligations, ref } = input;
  if (soldePrincipal === null) return null;
  const dernierJour = new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();

  const lignes: LignePrincipal[] = obligations
    .filter((o) => !o.isPaid)
    .map((o) => {
      if (o.amountDue.lt(0)) {
        throw new RangeError(`amountDue must be >= 0 (obligation ${o.id})`);
      }
      return {
        id: o.id,
        source: o.source,
        label: o.label,
        montant: o.amountDue,
        jour: Math.min(o.paymentDay, dernierJour),
        rang:
          o.installmentIndex !== null && o.installmentsTotal !== null
            ? { index: o.installmentIndex, total: o.installmentsTotal }
            : null,
      };
    });

  const aPayer = lignes.reduce((acc, l) => acc.plus(l.montant), new Decimal(0));
  return { solde: soldePrincipal, lignes, aPayer, montant: soldePrincipal.minus(aPayer) };
}
