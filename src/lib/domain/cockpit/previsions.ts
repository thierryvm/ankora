import Decimal from 'decimal.js';

import type { CockpitCharge, ReferencePeriod } from './types';

export type PrevisionMonth = Readonly<{
  /** Calendar year of the projected month. */
  year: number;
  /** 1..12 */
  month: number;
  /** Sum of every active charge whose paymentMonths includes this month. */
  totalCharges: Decimal;
  /** revenus - totalCharges - plafondQuotidien — same calc as the marge brute. */
  margePrevue: Decimal;
}>;

export type PrevisionsInput = Readonly<{
  charges: readonly CockpitCharge[];
  ref: ReferencePeriod;
  revenus: Decimal;
  plafondQuotidien: Decimal;
  /** How many months to project. Spec is fixed at 6; exposed for testing. */
  horizonMonths?: number;
}>;

const DEFAULT_HORIZON = 6;

/**
 * Projects the next N months (default 6, per spec). Each month carries the
 * total cash that will leave the account (charges due that month) and the
 * resulting marge brute. The UI renders the bar chart from this list.
 *
 * Year wraps when ref.month + i overflows December.
 */
export function genererPrevisions(input: PrevisionsInput): readonly PrevisionMonth[] {
  const horizon = input.horizonMonths ?? DEFAULT_HORIZON;
  if (horizon < 1) {
    throw new RangeError('horizonMonths must be >= 1');
  }

  const out: PrevisionMonth[] = [];
  for (let i = 0; i < horizon; i += 1) {
    const offset = input.ref.month + i; // 1-based
    const month = ((offset - 1) % 12) + 1; // 1..12
    const yearDelta = Math.floor((offset - 1) / 12);
    const year = input.ref.year + yearDelta;

    const totalCharges = input.charges
      .filter((c) => c.isActive && c.paymentMonths.includes(month))
      .reduce((acc, c) => acc.plus(c.amount), new Decimal(0));

    const margePrevue = input.revenus.minus(totalCharges).minus(input.plafondQuotidien);

    out.push({ year, month, totalCharges, margePrevue });
  }

  return out;
}
