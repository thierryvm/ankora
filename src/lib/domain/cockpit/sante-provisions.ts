import Decimal from 'decimal.js';

import {
  CYCLE_MONTHS,
  isPeriodicFrequency,
  paymentKey,
  type CockpitCharge,
  type PaymentLedger,
  type ReferencePeriod,
} from './types';

/** Rattrapage horizon — fixed at 3 months per ADR-011. */
export const RATTRAPAGE_MONTHS = 3;

export type EpargneRequiseInput = Readonly<{
  charge: CockpitCharge;
  ref: ReferencePeriod;
  payments: PaymentLedger;
}>;

/**
 * For a given periodic charge `c` and a reference month `M`, compute how
 * much of the cycle's smoothing should already be sitting in the
 * provisions account.
 *
 * Algorithm — copied verbatim from ADR-011:
 *
 *   1. nextMois = first month ∈ paymentMonths with month ≥ M.
 *      If nextMois = M and the charge is already paid this period,
 *      advance nextMois to the next entry (with rollover).
 *      If no nextMois found at all, rollover to paymentMonths[0].
 *
 *   2. monthsLeft = nextMois - M
 *      If nextMois < M (we wrapped to next year) OR
 *         nextMois = M AND already paid → +12.
 *      If nextMois = M AND not paid → 0.
 *
 *   3. cycleMonths = 12 (annual) / 6 (semiannual) / 3 (quarterly)
 *
 *   4. safeMonthsLeft is `monthsLeft` reduced into the cycle window.
 *
 *   5. epargneRequise = amount - (amount / cycleMonths × safeMonthsLeft)
 */
export function calculerEpargneRequiseParCharge(input: EpargneRequiseInput): Decimal {
  const { charge: c, ref, payments } = input;

  if (!isPeriodicFrequency(c.frequency)) {
    // Monthly charges have no provisioning target.
    return new Decimal(0);
  }
  if (!c.isActive || c.paymentMonths.length === 0) {
    return new Decimal(0);
  }

  const sortedMonths = [...c.paymentMonths].sort((a, b) => a - b);
  const isPayeCeMois = payments.get(paymentKey(c.id, ref.year, ref.month)) === true;

  // Step 1 — locate nextMois.
  let nextMois = sortedMonths.find((m) => m >= ref.month);
  if (nextMois === ref.month && isPayeCeMois) {
    // The reference month has been settled — skip to the following entry.
    const after = sortedMonths.find((m) => m > ref.month);
    nextMois = after ?? sortedMonths[0];
  }
  if (nextMois === undefined) {
    nextMois = sortedMonths[0];
  }
  // We've guarded `length === 0` already; nextMois is now always defined.
  const next = nextMois as number;

  // Step 2 — monthsLeft with wrap-around.
  let monthsLeft = next - ref.month;
  if (next < ref.month || (next === ref.month && isPayeCeMois)) {
    monthsLeft += 12;
  }
  if (next === ref.month && !isPayeCeMois) {
    monthsLeft = 0;
  }

  // Step 3 — cycleMonths.
  const cycleMonths = CYCLE_MONTHS[c.frequency];

  // Step 4 — safeMonthsLeft, reduced into the cycle window.
  let safeMonthsLeft: number;
  if (monthsLeft === 0) {
    safeMonthsLeft = 0;
  } else if (monthsLeft % cycleMonths === 0) {
    safeMonthsLeft = cycleMonths;
  } else {
    safeMonthsLeft = monthsLeft % cycleMonths;
  }

  // Step 5 — épargne requise.
  return c.amount.minus(c.amount.dividedBy(cycleMonths).times(safeMonthsLeft));
}

export type SanteProvisionsInput = Readonly<{
  charges: readonly CockpitCharge[];
  payments: PaymentLedger;
  soldeEpargneActuel: Decimal;
  ref: ReferencePeriod;
}>;

export type SanteProvisionsDetailEntry = Readonly<{
  chargeId: string;
  epargneRequise: Decimal;
}>;

export type SanteProvisionsOutput = Readonly<{
  totalEpargneTheorique: Decimal;
  soldeEpargneActuel: Decimal;
  /** > 0 when the user is under target; ≤ 0 when on track or over. */
  deficitEpargne: Decimal;
  /** deficitEpargne / 3 when positive, else 0. */
  rattrapageMensuel: Decimal;
  statut: 'a_jour' | 'deficit';
  detailParCharge: readonly SanteProvisionsDetailEntry[];
}>;

/**
 * Aggregate Santé des Provisions calculation (ADR-011).
 * Returns both the global totals and the per-charge breakdown so the UI
 * can display the full ledger without re-iterating.
 */
export function calculerSanteProvisions(input: SanteProvisionsInput): SanteProvisionsOutput {
  const detailParCharge: SanteProvisionsDetailEntry[] = input.charges
    .filter((c) => c.isActive && isPeriodicFrequency(c.frequency))
    .map((c) => ({
      chargeId: c.id,
      epargneRequise: calculerEpargneRequiseParCharge({
        charge: c,
        ref: input.ref,
        payments: input.payments,
      }),
    }));

  const totalEpargneTheorique = detailParCharge.reduce(
    (acc, d) => acc.plus(d.epargneRequise),
    new Decimal(0),
  );

  const deficitEpargne = totalEpargneTheorique.minus(input.soldeEpargneActuel);
  const rattrapageMensuel = deficitEpargne.gt(0)
    ? deficitEpargne.dividedBy(RATTRAPAGE_MONTHS)
    : new Decimal(0);

  return {
    totalEpargneTheorique,
    soldeEpargneActuel: input.soldeEpargneActuel,
    deficitEpargne,
    rattrapageMensuel,
    statut: deficitEpargne.gt(0) ? 'deficit' : 'a_jour',
    detailParCharge,
  };
}
