import { z } from 'zod';

/**
 * Toggle a charge as paid / unpaid for a given (year, month) period.
 *
 * Naming aligned with PR-D1 migration `charge_payments` (per ADR-010 + ADR-011):
 *   period_year (smallint, 2000-2100)
 *   period_month (smallint, 1-12)
 *
 * The `paidAmount` is optional — when omitted, the application layer
 * defaults it to `charges.amount` at the moment of the toggle (Phase 1 UX).
 * Phase 2 UI will expose an override (e.g. user paid 95€ for a 100€ rent).
 */
export const chargePaymentToggleSchema = z.object({
  chargeId: z.string().uuid({ message: 'chargePayment.chargeId.invalid' }),
  periodYear: z
    .number({ error: 'chargePayment.periodYear.range' })
    .int({ message: 'chargePayment.periodYear.range' })
    .min(2000, { message: 'chargePayment.periodYear.range' })
    .max(2100, { message: 'chargePayment.periodYear.range' }),
  periodMonth: z
    .number({ error: 'chargePayment.periodMonth.range' })
    .int({ message: 'chargePayment.periodMonth.range' })
    .min(1, { message: 'chargePayment.periodMonth.range' })
    .max(12, { message: 'chargePayment.periodMonth.range' }),
  /** Optional override; defaults to `charges.amount` at the application layer. */
  paidAmount: z
    .number({ error: 'chargePayment.paidAmount.invalid' })
    .finite({ message: 'chargePayment.paidAmount.invalid' })
    .min(0, { message: 'chargePayment.paidAmount.negative' })
    .max(1_000_000, { message: 'chargePayment.paidAmount.tooHigh' })
    .optional(),
  note: z.string().max(500).optional().nullable(),
});

export type ChargePaymentToggleInput = z.infer<typeof chargePaymentToggleSchema>;
