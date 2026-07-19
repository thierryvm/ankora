/**
 * Active charges DUE in `period` that carry no paid tick.
 *
 * Feeds the "forgotten bills" alert (epic Factures cohérentes): the payment
 * ledger is per-period, so when the month rolls over every checkbox naturally
 * resets — which also makes last month's unticked bills invisible. Fed with
 * the PREVIOUS period's paid charge ids, this tells the dashboard WHICH bills
 * were never ticked so the user can check they were actually paid.
 *
 * Pure calendar/set logic — no dates are resolved, no money involved.
 */
export type UnpaidCountCharge = Readonly<{
  id: string;
  paymentMonths: readonly number[];
  isActive: boolean;
}>;

/** The charges themselves (generic: callers keep their richer charge type). */
export function unpaidChargesForPeriod<T extends UnpaidCountCharge>(
  charges: readonly T[],
  paidChargeIds: ReadonlySet<string>,
  period: Readonly<{ month: number }>,
): T[] {
  return charges.filter(
    (c) => c.isActive && c.paymentMonths.includes(period.month) && !paidChargeIds.has(c.id),
  );
}

export function countUnpaidForPeriod(
  charges: readonly UnpaidCountCharge[],
  paidChargeIds: ReadonlySet<string>,
  period: Readonly<{ month: number }>,
): number {
  return unpaidChargesForPeriod(charges, paidChargeIds, period).length;
}
