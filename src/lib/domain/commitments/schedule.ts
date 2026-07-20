/**
 * Pure schedule + balance math for commitments (épic « Dettes & échéanciers »).
 *
 * A commitment is an engagement with a FINITE number of instalments — a debt
 * with a remaining balance (car loan), an instalment plan that stops (SPF tax
 * arrangement), or a one-off future bill (a single instalment).
 *
 * Everything here is DERIVED from the anchor + cadence + instalment count:
 * the end date, the remaining balance and the progress are never stored, so
 * they can never drift from reality. Zero DB/React dependency.
 *
 * Money note: amounts are plain `number` (euros) because a commitment's
 * arithmetic is a fixed count of identical instalments, not a smoothing
 * computation — the Decimal domain stays reserved for the cockpit budget math.
 * The final instalment absorbs any rounding remainder (see `remainingBalance`).
 */
export type CommitmentKind = 'debt' | 'installment_plan' | 'one_off';
export type CommitmentFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export type Period = Readonly<{ year: number; month: number }>;

export type Commitment = Readonly<{
  id: string;
  kind: CommitmentKind;
  /** Amount still engaged when the commitment was created. */
  totalAmount: number;
  /** Amount of ONE instalment; null for a one-off (the total is due once). */
  installmentAmount: number | null;
  installmentsTotal: number;
  /** Anchor = the NEXT instalment (locked decision D3), not the historical start. */
  startYear: number;
  startMonth: number;
  paymentDay: number;
  frequency: CommitmentFrequency;
  isActive: boolean;
}>;

const MONTHS_BETWEEN: Record<CommitmentFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/** Stable key for a paid-period set — mirrors the ledger key convention. */
export const periodKey = (year: number, month: number): string => `${year}-${month}`;

/** Every scheduled instalment period, in chronological order. */
export function installmentPeriods(c: Commitment): Period[] {
  const step = MONTHS_BETWEEN[c.frequency];
  return Array.from({ length: c.installmentsTotal }, (_, i) => {
    const total = c.startMonth - 1 + i * step;
    return { year: c.startYear + Math.floor(total / 12), month: (total % 12) + 1 };
  });
}

/** Period of the LAST instalment — when the commitment stops weighing on the budget. */
export function endPeriod(c: Commitment): Period {
  const periods = installmentPeriods(c);
  return periods[periods.length - 1] ?? { year: c.startYear, month: c.startMonth };
}

/** Whether an instalment falls due in `period` (inactive commitments never are). */
export function isDueInPeriod(c: Commitment, period: Period): boolean {
  if (!c.isActive) return false;
  return installmentPeriods(c).some((p) => p.year === period.year && p.month === period.month);
}

/** The amount of one instalment — a one-off owes its whole total at once. */
export function installmentAmountOf(c: Commitment): number {
  return c.installmentAmount ?? c.totalAmount;
}

/**
 * How many SCHEDULED instalments carry a paid tick. Ledger entries outside the
 * schedule are ignored, so a stray tick can never over-count progress.
 */
export function installmentsPaid(c: Commitment, paidPeriodKeys: ReadonlySet<string>): number {
  return installmentPeriods(c).filter((p) => paidPeriodKeys.has(periodKey(p.year, p.month))).length;
}

/**
 * Amount still owed. Clamped to [0, totalAmount]: the last instalment absorbs
 * any rounding remainder (3 × 33.33 € on a 100 € plan lands on exactly 0),
 * and a fully-ticked commitment always reads 0 — never a negative balance.
 */
export function remainingBalance(c: Commitment, paidPeriodKeys: ReadonlySet<string>): number {
  const paid = installmentsPaid(c, paidPeriodKeys);
  if (paid >= c.installmentsTotal) return 0;
  const remaining = c.totalAmount - paid * installmentAmountOf(c);
  return Math.max(0, remaining);
}

/** True once every scheduled instalment has been ticked. */
export function isFinished(c: Commitment, paidPeriodKeys: ReadonlySet<string>): boolean {
  return installmentsPaid(c, paidPeriodKeys) >= c.installmentsTotal;
}
