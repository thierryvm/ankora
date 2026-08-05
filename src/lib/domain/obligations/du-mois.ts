import Decimal from 'decimal.js';

import {
  installmentAmountAt,
  installmentIndexAt,
  isDueInPeriod,
  periodKey,
} from '@/lib/domain/commitments';
import {
  paymentKey,
  type CockpitCharge,
  type PaymentLedger,
  type ReferencePeriod,
} from '@/lib/domain/cockpit/types';
import type { MonthObligation, NamedCommitment } from './types';

const EMPTY: ReadonlySet<string> = new Set();

export type ObligationsDuMoisInput = Readonly<{
  charges: readonly CockpitCharge[];
  /** `charge_payments` for the reference period, keyed by `paymentKey`. */
  chargePayments: PaymentLedger;
  commitments: readonly NamedCommitment[];
  /** `commitment_payments` period keys (`${year}-${month}`), per commitment id. */
  paidKeysByCommitment: ReadonlyMap<string, ReadonlySet<string>>;
  ref: ReferencePeriod;
}>;

/**
 * Every obligation falling due in `ref`, charges and commitment instalments in
 * ONE list.
 *
 * ## Why the two families had to meet
 *
 * `charges` and `commitments` have no common key, and until now no screen put
 * them side by side. That is how the same debt came to live in both tables and
 * be subtracted twice from « Budget du mois » — nothing, in the code or on the
 * screen, could see the pair. A single list is the structural half of the fix:
 * a duplicate becomes visible to the eye, and `doublons.ts` names it.
 *
 * ## Derived, not generated
 *
 * A commitment occurrence exists here because `isDueInPeriod()` says the anchor
 * + cadence + instalment count place one in this month — never because a row
 * was written. Generating instalment rows would reintroduce exactly the drift
 * ADR-021 removed, and cost a migration.
 *
 * Inactive charges and inactive/finished commitments contribute nothing:
 * `isDueInPeriod` already refuses an inactive commitment, and a charge is
 * filtered on `isActive` here — the same predicate the money math uses.
 */
export function obligationsDuMois(input: ObligationsDuMoisInput): readonly MonthObligation[] {
  const { ref } = input;

  const fromCharges: MonthObligation[] = input.charges
    .filter((c) => c.isActive && c.paymentMonths.includes(ref.month))
    .map((c) => ({
      id: c.id,
      source: 'charge' as const,
      label: c.label,
      amountDue: c.amount,
      paymentDay: c.paymentDay,
      isPaid: input.chargePayments.get(paymentKey(c.id, ref.year, ref.month)) === true,
      installmentIndex: null,
      installmentsTotal: null,
    }));

  const fromCommitments: MonthObligation[] = input.commitments
    .filter((c) => isDueInPeriod(c, ref))
    .map((c) => ({
      id: c.id,
      source: 'commitment' as const,
      label: c.label,
      amountDue: new Decimal(installmentAmountAt(c, installmentIndexAt(c, ref))),
      paymentDay: c.paymentDay,
      isPaid: (input.paidKeysByCommitment.get(c.id) ?? EMPTY).has(periodKey(ref.year, ref.month)),
      installmentIndex: installmentIndexAt(c, ref) + 1,
      installmentsTotal: c.installmentsTotal,
    }));

  return [...fromCharges, ...fromCommitments].sort(
    (a, b) => a.paymentDay - b.paymentDay || a.label.localeCompare(b.label),
  );
}

/**
 * « À PAYER CE MOIS » — the cash view.
 *
 * Σ of every occurrence falling due this month, all sources confounded. This is
 * the number the user asks for at the start of the month: what actually leaves
 * the account. It is NOT « Effort lissé » (`effort-lisse.ts`), which spreads
 * periodic bills over their cycle.
 *
 * The same euro legitimately appears in both views. It must never appear twice
 * in ONE of them — which is why this function sums a list built from two
 * disjoint sources, never two independently computed totals.
 */
export function aPayerCeMois(obligations: readonly MonthObligation[]): Decimal {
  return obligations.reduce((acc, o) => acc.plus(o.amountDue), new Decimal(0));
}

/** Same view, restricted to what is still unticked. */
export function resteAPayerCeMois(obligations: readonly MonthObligation[]): Decimal {
  return obligations.reduce((acc, o) => (o.isPaid ? acc : acc.plus(o.amountDue)), new Decimal(0));
}
