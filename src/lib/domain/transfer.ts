import { zero, type Charge, type Money } from '@/lib/domain/types';
import {
  isChargeDueInMonth,
  monthlyProvisionFor,
  monthlyProvisionTotal,
} from '@/lib/domain/budget';

/**
 * Concrete movements to perform at the start of a month under the 3-account
 * IronBudget model. All figures are absolute positive amounts except where
 * noted — UI decides the visual direction from the sign of epargneTransferNet.
 */
export type MonthlyTransferPlan = {
  month: number;
  /** Salary credited to Principal. */
  salary: Money;
  /** Fixed allowance Principal → Vie Courante. */
  vieCouranteTransfer: Money;
  /** Net transfer Principal → Épargne for smoothed charges.
   *  Positive = Principal pays forward into Épargne.
   *  Negative = Épargne pays back to Principal (heavy bill month). */
  epargneTransferNet: Money;
  /** Sum of charges paid directly from Principal in this month (monthly bills
   *  plus any periodic charge explicitly flagged paid_from='principal'). */
  principalBillsDue: Money;
  /** Commitment instalments falling due this month — cash, like the bills above. */
  commitmentsDue: Money;
  /** Sum of smoothed (epargne) charges actually dropping this month. */
  epargneBillsDue: Money;
  /** Total monthly provision target for smoothed charges — the baseline before
   *  netting against bills due. Useful for "healthy flow" UI. */
  epargneProvisionTarget: Money;
  /**
   * The PROVISIONS share of a transfer to the provisions account: the net of
   * the month, never the target (`provisionPartOfMonth`). The line, the sheet,
   * the server write and « Mis de côté » all read this one figure.
   */
  epargneProvisionPart: Money;
  /** Residual on Principal after salary - vieCouranteTransfer - epargneNet
   *  - principalBillsDue - epargneBillsDue - commitmentsDue. A smoothed bill
   *  is paid FROM the main account (ADR-045 D22): only its net reaches the
   *  provisions, the bill itself leaves Principal. Negative = the month does not break
   *  even. */
  netPrincipalAfterPlan: Money;
};

export type TransferPlanInput = {
  charges: readonly Charge[];
  month: number;
  monthlyIncome: Money;
  vieCouranteMonthlyTransfer: Money;
  /**
   * Commitment instalments falling due this month, derived by the caller from
   * `obligationsDuMois()` — the SAME list the month's bill screen ticks.
   *
   * Required, with no silent default. « Restant Principal » used to ignore the
   * commitments that « Budget du mois » deducts: two "remainings" on one
   * screen, two perimeters, and no label saying so. Making this a mandatory
   * input means a forgotten wiring breaks the build instead of quietly
   * restoring the discrepancy — same doctrine as `engagementsMensuels` in
   * `calculerSituationDuMois`.
   */
  commitmentsDue: Money;
};

/**
 * Build the month's 3-account movement plan.
 *
 * Smoothed charges (paid_from='epargne'): provision sits on Épargne and absorbs
 * the bill when it drops. We execute a single net transfer each month instead
 * of the naive "provision-then-withdraw" pair.
 *
 * Non-smoothed charges (paid_from='principal'): paid straight from Principal
 * on their due month. The user's salary must cover them directly.
 */
export function computeMonthlyTransferPlan({
  charges,
  month,
  monthlyIncome,
  vieCouranteMonthlyTransfer,
  commitmentsDue,
}: TransferPlanInput): MonthlyTransferPlan {
  if (month < 1 || month > 12) throw new RangeError(`month must be 1..12, received ${month}`);
  if (monthlyIncome.lt(0)) throw new RangeError('monthlyIncome must be >= 0');
  if (vieCouranteMonthlyTransfer.lt(0))
    throw new RangeError('vieCouranteMonthlyTransfer must be >= 0');
  if (commitmentsDue.lt(0)) throw new RangeError('commitmentsDue must be >= 0');

  const smoothed = smoothedCharges(charges);
  const principalCharges = charges.filter((c) => c.isActive && c.paidFrom === 'principal');

  const epargneProvisionTarget = monthlyProvisionTotal(smoothed);

  const epargneBillsDue = smoothed.reduce(
    (acc, c) => (isChargeDueInMonth(c, month) ? acc.plus(c.amount) : acc),
    zero(),
  );

  const epargneTransferNet = epargneProvisionTarget.minus(epargneBillsDue);

  const principalBillsDue = principalCharges.reduce(
    (acc, c) => (isChargeDueInMonth(c, month) ? acc.plus(c.amount) : acc),
    zero(),
  );

  // The commitment instalment is cash leaving Principal this month, exactly
  // like a bill. It belongs to the CASH view (« À payer ce mois »), which is
  // why it is subtracted here and NOT smoothed: the smoothed form of the same
  // euro lives in « Effort lissé », a different view with a different name.
  // One rule, one word — the two must never both be called « ce qui reste ».
  const netPrincipalAfterPlan = monthlyIncome
    .minus(vieCouranteMonthlyTransfer)
    .minus(epargneTransferNet)
    .minus(principalBillsDue)
    .minus(epargneBillsDue)
    .minus(commitmentsDue);

  return {
    month,
    salary: monthlyIncome,
    vieCouranteTransfer: vieCouranteMonthlyTransfer,
    epargneTransferNet,
    principalBillsDue,
    commitmentsDue,
    epargneBillsDue,
    epargneProvisionTarget,
    epargneProvisionPart: provisionPartOfMonth(charges, month),
    netPrincipalAfterPlan,
  };
}

function smoothedCharges(charges: readonly Charge[]): Charge[] {
  return charges.filter((c) => c.isActive && c.paidFrom === 'epargne');
}

/**
 * The provisions share of the month's transfer to the provisions account:
 * monthly target − smoothed bills due this month, floored at 0.
 *
 * A smoothed bill is paid from the MAIN account (ADR-045 D22), so the
 * provisions only receive the net: the line « X à mettre de côté − Y de
 * factures ce mois » proposes exactly this figure. Splitting a transfer with
 * the target instead counted Y twice — once as provisions, once as a bill —
 * and « Mis de côté » lost Y. The server recomputes it from the charges when it
 * writes a transfer; the screen only displays it.
 */
export function provisionPartOfMonth(charges: readonly Charge[], month: number): Money {
  if (month < 1 || month > 12) throw new RangeError(`month must be 1..12, received ${month}`);
  const smoothed = smoothedCharges(charges);
  const net = monthlyProvisionTotal(smoothed).minus(
    smoothed.reduce((acc, c) => (isChargeDueInMonth(c, month) ? acc.plus(c.amount) : acc), zero()),
  );
  // Rounded to the cent (ADR-045 D19): 280/12 + 70/3 is 46.666…, and a part
  // with a third decimal is refused by the write it is meant for.
  return net.lt(0) ? zero() : net.toDecimalPlaces(2);
}

/**
 * What is still to transfer this month: the lines not done yet, in absolute
 * value (« À reprendre » is a transfer to make too). Zero once all are done —
 * the header then says so instead of repeating the plan.
 */
export function virementsRestants(lines: readonly { amount: Money; done: boolean }[]): Money {
  return lines.reduce((acc, l) => (l.done ? acc : acc.plus(l.amount.abs())), zero());
}

/**
 * Projected Épargne balance after this month's net transfer lands.
 * Helper for "Plan du mois" UI — caller supplies current balance.
 */
export function projectedEpargneBalance(currentBalance: Money, plan: MonthlyTransferPlan): Money {
  return currentBalance.plus(plan.epargneTransferNet);
}

export const transferPlanInternals = { monthlyProvisionFor };
