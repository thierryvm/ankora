import { isFinished } from '@/lib/domain/commitments';
import type { Commitment, CommitmentFrequency, CommitmentKind } from '@/lib/domain/commitments';
import type { ChargePaidFrom } from '@/lib/domain/types';

/**
 * Transport shape of a commitment across the RSC boundary — money as plain
 * `number`, never Decimal.
 *
 * This module is deliberately FREE of any Supabase/`env` import: UI components
 * (and their tests) need the type and the mapper, and pulling the DB client in
 * with them would drag server-only env parsing into the client bundle and blow
 * up component tests. The impure read lives next door in `commitments.ts`.
 */
export type CommitmentRow = {
  id: string;
  label: string;
  kind: CommitmentKind;
  totalAmount: number;
  installmentAmount: number | null;
  installmentsTotal: number;
  startYear: number;
  startMonth: number;
  paymentDay: number;
  frequency: CommitmentFrequency;
  notes: string | null;
  isActive: boolean;
  /**
   * Which account settles this commitment's instalments. Same two values as
   * `charges.paid_from` — `commitments.paid_from` carries the identical CHECK,
   * so the type is reused rather than re-declared.
   *
   * REQUIRED on purpose (ADR-038 D3). The bulk tick in `obligations.ts` has to
   * stamp each instalment payment with the account it came from, and the
   * domain's `MonthObligation` deliberately does not carry it. Making the field
   * optional would let a future producer forget it and silently attribute every
   * instalment to the main account. TypeScript pointing at each producer IS the
   * point.
   *
   * Not on `Commitment` (the pure-domain shape below): the schedule maths has
   * no use for it, and carrying it there would be dead weight.
   */
  paidFrom: ChargePaidFrom;
};

/**
 * Row → pure-domain projection. Single definition (Sourcery #235): the
 * dashboard card and the commitments page both consume it, so the schedule
 * math can never be fed two slightly different shapes.
 */
export const commitmentRowToDomain = (c: CommitmentRow): Commitment => ({
  id: c.id,
  kind: c.kind,
  totalAmount: c.totalAmount,
  installmentAmount: c.installmentAmount,
  installmentsTotal: c.installmentsTotal,
  startYear: c.startYear,
  startMonth: c.startMonth,
  paymentDay: c.paymentDay,
  frequency: c.frequency,
  isActive: c.isActive,
});

/**
 * Whether any commitment is still "live" — active and not fully settled. This
 * is the SAME predicate `EngagementsCard` uses to decide whether it renders
 * (it self-hides when empty), exposed here so the dashboard layout can reserve
 * the second column only when the card will actually show something (no empty
 * half-width hole on desktop). Single source → the two can never disagree.
 */
export function hasLiveCommitments(
  commitments: readonly CommitmentRow[],
  paidKeysByCommitment: Record<string, readonly string[]>,
): boolean {
  return commitments.some(
    (c) =>
      c.isActive &&
      !isFinished(commitmentRowToDomain(c), new Set(paidKeysByCommitment[c.id] ?? [])),
  );
}
