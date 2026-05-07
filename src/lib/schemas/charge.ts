import { z } from 'zod';

export const chargeFrequencySchema = z.enum(['monthly', 'quarterly', 'semiannual', 'annual'], {
  error: 'charge.frequency.invalid',
});

export const chargePaidFromSchema = z.enum(['principal', 'epargne'], {
  error: 'charge.paidFrom.invalid',
});

/** Schedule precision per ADR-010 (PR-D1). Each entry is a month (1-12). */
const paymentMonthsSchema = z
  .array(
    z
      .number({ error: 'charge.paymentMonths.range' })
      .int({ message: 'charge.paymentMonths.range' })
      .min(1, { message: 'charge.paymentMonths.range' })
      .max(12, { message: 'charge.paymentMonths.range' }),
  )
  .min(1, { message: 'charge.paymentMonths.empty' })
  .max(12, { message: 'charge.paymentMonths.tooMany' });

export const chargeInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { message: 'charge.label.required' })
    .max(120, { message: 'charge.label.tooLong' }),
  amount: z
    .number({ error: 'charge.amount.invalid' })
    .finite({ message: 'charge.amount.invalid' })
    .min(0, { message: 'charge.amount.negative' })
    .max(1_000_000, { message: 'charge.amount.tooHigh' }),
  frequency: chargeFrequencySchema,
  /**
   * Legacy single-month reference. Kept for backward-compat with the existing
   * `getWorkspaceSnapshot` reads. Will be dropped in PR-CLEANUP-LEGACY once
   * `paymentMonths` is fully consumed by the cockpit.
   * Application layer keeps it in sync with `paymentMonths[0]` on insert/update.
   */
  dueMonth: z
    .number({ error: 'charge.dueMonth.range' })
    .int({ message: 'charge.dueMonth.range' })
    .min(1, { message: 'charge.dueMonth.range' })
    .max(12, { message: 'charge.dueMonth.range' }),
  /** Months (1-12) the charge falls due. e.g. `[3, 6, 9, 12]` for trimestrielle. */
  paymentMonths: paymentMonthsSchema.optional(),
  /** Day of month (1-31) when the charge is due. Drives the bell notifications. */
  paymentDay: z
    .number({ error: 'charge.paymentDay.range' })
    .int({ message: 'charge.paymentDay.range' })
    .min(1, { message: 'charge.paymentDay.range' })
    .max(31, { message: 'charge.paymentDay.range' })
    .optional(),
  /** User-customisable order for the "À payer en {mois}" list (drag & drop in PR-D4 Phase 2 UI). */
  sortOrder: z
    .number({ error: 'charge.sortOrder.invalid' })
    .int({ message: 'charge.sortOrder.invalid' })
    .min(0, { message: 'charge.sortOrder.invalid' })
    .optional(),
  categoryId: z.string().uuid().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().max(500).optional().nullable(),
  paidFrom: chargePaidFromSchema.optional(),
});

export const chargeUpdateSchema = chargeInputSchema.partial();

export type ChargeInput = z.infer<typeof chargeInputSchema>;
export type ChargeUpdate = z.infer<typeof chargeUpdateSchema>;
export type ChargePaidFrom = z.infer<typeof chargePaidFromSchema>;
