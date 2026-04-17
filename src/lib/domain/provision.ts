import { money, zero, type Charge, type Money } from '@/lib/domain/types';
import { monthlyProvisionTotal } from '@/lib/domain/budget';

export type ProvisionHealth = {
  target: Money;
  actual: Money;
  delta: Money;
  /** Ratio actual/target, clamped to [0, 2]. 1 = on track. */
  score: number;
  status: 'healthy' | 'warning' | 'critical';
};

export type RecoveryPlan = {
  monthlyExtra: Money;
  months: number;
  totalToRecover: Money;
};

/**
 * Compare actual savings balance against theoretical provision target.
 * Target is calculated as N months of full provisioning since start.
 *
 * @param charges Active user charges
 * @param actualBalance Current savings balance allocated to provisions
 * @param monthsElapsed Months of tracking (min 1, max 12)
 */
export function assessHealth(
  charges: readonly Charge[],
  actualBalance: Money,
  monthsElapsed: number,
): ProvisionHealth {
  if (monthsElapsed < 1) throw new RangeError('monthsElapsed must be >= 1');
  const clampedMonths = Math.min(monthsElapsed, 12);

  const monthlyTarget = monthlyProvisionTotal(charges);
  const target = monthlyTarget.times(clampedMonths);
  const delta = actualBalance.minus(target);

  const rawScore = target.isZero() ? 1 : Number(actualBalance.div(target).toFixed(4));
  const score = Math.max(0, Math.min(2, rawScore));

  let status: ProvisionHealth['status'];
  if (score >= 0.95) status = 'healthy';
  else if (score >= 0.7) status = 'warning';
  else status = 'critical';

  return { target, actual: actualBalance, delta, score, status };
}

/**
 * When under target, compute a 3-month smoothed recovery plan.
 * Returns the extra monthly amount to allocate on top of normal provisioning.
 */
export function recoveryPlan(health: ProvisionHealth, recoveryMonths = 3): RecoveryPlan {
  if (recoveryMonths < 1) throw new RangeError('recoveryMonths must be >= 1');
  if (health.delta.gte(0)) {
    return { monthlyExtra: zero(), months: 0, totalToRecover: zero() };
  }
  const deficit = health.delta.abs();
  return {
    monthlyExtra: deficit.div(recoveryMonths),
    months: recoveryMonths,
    totalToRecover: deficit,
  };
}

/**
 * Total cash needed in savings to absorb the next 12 months of charges
 * assuming zero future contributions — worst-case buffer.
 */
export function safetyBuffer(charges: readonly Charge[]): Money {
  return charges.reduce((acc, charge) => {
    if (!charge.isActive) return acc;
    if (charge.frequency === 'monthly') return acc.plus(charge.amount.times(12));
    if (charge.frequency === 'quarterly') return acc.plus(charge.amount.times(4));
    if (charge.frequency === 'semiannual') return acc.plus(charge.amount.times(2));
    return acc.plus(charge.amount);
  }, money(0));
}
