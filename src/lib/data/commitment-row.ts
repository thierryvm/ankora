import type { Commitment, CommitmentFrequency, CommitmentKind } from '@/lib/domain/commitments';

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
