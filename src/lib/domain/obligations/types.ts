import type Decimal from 'decimal.js';

import type { Commitment } from '@/lib/domain/commitments';

/**
 * Which table holds the obligation. This is the ONLY thing that decides how an
 * obligation is counted — never a resemblance between two rows (cf.
 * `doublons.ts`).
 */
export type ObligationSource = 'charge' | 'commitment';

/**
 * A commitment carried alongside its human label. The pure `Commitment` shape
 * is schedule math and deliberately has no label; the month list needs one, and
 * widening the domain type would push a display concern into every arithmetic
 * call-site.
 */
export type NamedCommitment = Commitment & { readonly label: string };

/**
 * ONE occurrence of an obligation falling due in ONE reference month.
 *
 * Derived, never stored (ADR-021): for a charge from `paymentMonths`, for a
 * commitment from `isDueInPeriod()` over the anchor + cadence + instalment
 * count. Nothing here is written to the database — the only rows that exist
 * are the payment ticks.
 */
export type MonthObligation = Readonly<{
  /** Id of the source row — a `charges.id` or a `commitments.id`. */
  id: string;
  source: ObligationSource;
  label: string;
  /** Cash that leaves the account when THIS occurrence falls due. */
  amountDue: Decimal;
  /** Day of the month it falls due (1..31, clamped for short months at render). */
  paymentDay: number;
  /** Already ticked for the reference period. */
  isPaid: boolean;
  /**
   * Position in the schedule, `1`-based — « échéance 5/11 ». `null` for a
   * charge, which is perpetual and has no countdown.
   */
  installmentIndex: number | null;
  /** Total number of instalments. `null` for a charge. */
  installmentsTotal: number | null;
}>;
