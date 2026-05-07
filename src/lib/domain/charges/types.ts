import type { ChargeFrequency, ChargePaidFrom, Money } from '@/lib/domain/types';

/**
 * Schedule-aware charge record (PR-D1 schema, ADR-010).
 *
 * Distinct from the legacy `Charge` type in `@/lib/domain/types` (which the
 * cockpit math + workspace-snapshot still consume). `ChargeRecord` is the
 * canonical shape that the new CRUD layer (PR-D4) operates on — it carries
 * the full schedule precision (`paymentMonths`, `paymentDay`, `sortOrder`)
 * shipped by PR-D1 migrations.
 *
 * Drop the legacy `Charge` once `getWorkspaceSnapshot` migrates.
 */
export type ChargeRecord = Readonly<{
  id: string;
  workspaceId: string;
  label: string;
  amount: Money;
  frequency: ChargeFrequency;
  /** Months (1-12) the charge falls due. Sorted ascending. Length ≥ 1. */
  paymentMonths: readonly number[];
  /** Day of month (1-31) when the charge is due. Drives J-3 / J-1 / overdue notifications. */
  paymentDay: number;
  /**
   * Legacy single-month reference. Kept in sync with `paymentMonths[0]` at
   * insert/update so the legacy snapshot reads stay valid until
   * PR-CLEANUP-LEGACY drops the column.
   */
  dueMonth: number;
  /** User-customisable sort order in the "À payer en {mois}" list. */
  sortOrder: number;
  categoryId: string | null;
  isActive: boolean;
  notes: string | null;
  paidFrom: ChargePaidFrom;
}>;

/**
 * Input shape accepted by `updateCharge()`. Each field is optional —
 * supplying `undefined` leaves the current value untouched.
 *
 * Mirrors `chargeUpdateSchema` (Zod) but with `Money` (Decimal) instead of
 * `number` for `amount`, so the domain layer can keep arithmetic exact.
 */
export type ChargeUpdateInput = Readonly<{
  label?: string;
  amount?: Money;
  frequency?: ChargeFrequency;
  paymentMonths?: readonly number[];
  paymentDay?: number;
  sortOrder?: number;
  categoryId?: string | null;
  isActive?: boolean;
  notes?: string | null;
  paidFrom?: ChargePaidFrom;
}>;
