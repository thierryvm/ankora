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
  /** Sum of smoothed (epargne) charges actually dropping this month. */
  epargneBillsDue: Money;
  /** Total monthly provision target for smoothed charges — the baseline before
   *  netting against bills due. Useful for "healthy flow" UI. */
  epargneProvisionTarget: Money;
  /** Residual on Principal after salary - vieCouranteTransfer - epargneNet
   *  - principalBillsDue. Negative = the month does not break even. */
  netPrincipalAfterPlan: Money;
};

export type TransferPlanInput = {
  charges: readonly Charge[];
  month: number;
  monthlyIncome: Money;
  vieCouranteMonthlyTransfer: Money;
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
}: TransferPlanInput): MonthlyTransferPlan {
  if (month < 1 || month > 12) throw new RangeError(`month must be 1..12, received ${month}`);
  if (monthlyIncome.lt(0)) throw new RangeError('monthlyIncome must be >= 0');
  if (vieCouranteMonthlyTransfer.lt(0))
    throw new RangeError('vieCouranteMonthlyTransfer must be >= 0');

  const smoothed = charges.filter((c) => c.isActive && c.paidFrom === 'epargne');
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

  const netPrincipalAfterPlan = monthlyIncome
    .minus(vieCouranteMonthlyTransfer)
    .minus(epargneTransferNet)
    .minus(principalBillsDue);

  return {
    month,
    salary: monthlyIncome,
    vieCouranteTransfer: vieCouranteMonthlyTransfer,
    epargneTransferNet,
    principalBillsDue,
    epargneBillsDue,
    epargneProvisionTarget,
    netPrincipalAfterPlan,
  };
}

/**
 * Projected Épargne balance after this month's net transfer lands.
 * Helper for "Plan du mois" UI — caller supplies current balance.
 */
export function projectedEpargneBalance(currentBalance: Money, plan: MonthlyTransferPlan): Money {
  return currentBalance.plus(plan.epargneTransferNet);
}

export const transferPlanInternals = { monthlyProvisionFor };
