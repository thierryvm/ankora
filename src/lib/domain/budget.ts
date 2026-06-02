import { money, zero, type Charge, type ChargeFrequency, type Money } from '@/lib/domain/types';

export const FREQUENCIES: readonly ChargeFrequency[] = [
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
];

export const FREQUENCY_DIVISOR: Record<ChargeFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/**
 * Whether a charge falls due in a given month.
 * Monthly charges are always due; periodic charges only on their reference month
 * and every N months thereafter (N = period in months).
 */
export function isChargeDueInMonth(charge: Charge, month: number): boolean {
  if (!charge.isActive) return false;
  if (charge.frequency === 'monthly') return true;
  const period = FREQUENCY_DIVISOR[charge.frequency];
  if (period === 12) return charge.dueMonth === month;
  return (((month - charge.dueMonth) % period) + period) % period === 0;
}

/**
 * Monthly provision target for a single charge — amount spread across its period.
 * e.g. annual 1200€ → 100€/month; quarterly 300€ → 100€/month.
 */
export function monthlyProvisionFor(charge: Charge): Money {
  if (!charge.isActive) return zero();
  return charge.amount.div(FREQUENCY_DIVISOR[charge.frequency]);
}

/**
 * Total monthly provision target across all charges — what the user should
 * theoretically set aside every month to cover all future bills smoothly.
 */
export function monthlyProvisionTotal(charges: readonly Charge[]): Money {
  return charges.reduce((acc, charge) => acc.plus(monthlyProvisionFor(charge)), zero());
}

/**
 * Bills actually due in a given month (1-12) — the cash that will leave the account.
 * Monthly charges are due every month; periodic charges are due only on their reference month.
 */
export function billsDueInMonth(charges: readonly Charge[], month: number): Money {
  if (month < 1 || month > 12) throw new RangeError(`month must be 1..12, received ${month}`);

  return charges.reduce(
    (acc, charge) => (isChargeDueInMonth(charge, month) ? acc.plus(charge.amount) : acc),
    zero(),
  );
}

/**
 * Suggested transfer to savings for a given month.
 *   transfer = provisions_total - bills_due_this_month
 * Negative result = net withdrawal from savings (bills exceed provisioning).
 */
export function suggestedTransfer(charges: readonly Charge[], month: number): Money {
  return monthlyProvisionTotal(charges).minus(billsDueInMonth(charges, month));
}

/**
 * Raw amount summed per frequency bucket, across active charges only.
 *
 * Unlike {@link monthlyProvisionTotal} (which smooths every charge onto a
 * monthly cadence) this keeps each charge at its native cadence: the
 * `annual` bucket sums the once-a-year amounts as billed, the `monthly`
 * bucket sums the recurring monthly amounts, etc. Summing within a single
 * cadence is financially coherent (no cross-cadence aggregation), which is
 * exactly what the charges list shows as a per-group subtotal.
 *
 * Inactive charges are skipped so the buckets reconcile with the global
 * {@link monthlyProvisionTotal} / {@link annualTotal} totals (both active-only).
 */
export function subtotalByFrequency(charges: readonly Charge[]): Record<ChargeFrequency, Money> {
  const acc: Record<ChargeFrequency, Money> = {
    monthly: zero(),
    quarterly: zero(),
    semiannual: zero(),
    annual: zero(),
  };
  for (const charge of charges) {
    if (!charge.isActive) continue;
    acc[charge.frequency] = acc[charge.frequency].plus(charge.amount);
  }
  return acc;
}

/**
 * Annual total of all active charges — sanity-check against yearly budget.
 */
export function annualTotal(charges: readonly Charge[]): Money {
  return charges.reduce((acc, charge) => {
    if (!charge.isActive) return acc;
    const occurrences = 12 / FREQUENCY_DIVISOR[charge.frequency];
    return acc.plus(charge.amount.times(occurrences));
  }, money(0));
}
