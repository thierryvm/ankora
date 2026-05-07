import type { Money } from '@/lib/domain/types';

/**
 * Per-period payment record (PR-D1 schema, ADR-010 + ADR-011).
 *
 * One row per (charge_id, period_year, period_month) — UNIQUE in DB.
 * Drives the "À payer / Payé" toggle UX (PR-D4 Phase 2 UI) and the
 * Santé Provisions algorithm (`@/lib/domain/cockpit/sante-provisions`).
 */
export type ChargePaymentRecord = Readonly<{
  id: string;
  chargeId: string;
  workspaceId: string;
  periodYear: number;
  periodMonth: number;
  /** ISO timestamp `YYYY-MM-DDTHH:mm:ssZ` — when the toggle was hit. */
  paidAt: string;
  paidAmount: Money;
  /** Forward-compat: nullable until ADR-015 (savings_buckets) lands. */
  bucketId: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
}>;
