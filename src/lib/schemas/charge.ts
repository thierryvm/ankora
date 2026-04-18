import { z } from 'zod';

export const chargeFrequencySchema = z.enum(['monthly', 'quarterly', 'semiannual', 'annual'], {
  error: 'charge.frequency.invalid',
});

export const chargePaidFromSchema = z.enum(['principal', 'epargne'], {
  error: 'charge.paidFrom.invalid',
});

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
  dueMonth: z
    .number({ error: 'charge.dueMonth.range' })
    .int({ message: 'charge.dueMonth.range' })
    .min(1, { message: 'charge.dueMonth.range' })
    .max(12, { message: 'charge.dueMonth.range' }),
  categoryId: z.string().uuid().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().max(500).optional().nullable(),
  paidFrom: chargePaidFromSchema.optional(),
});

export const chargeUpdateSchema = chargeInputSchema.partial();

export type ChargeInput = z.infer<typeof chargeInputSchema>;
export type ChargeUpdate = z.infer<typeof chargeUpdateSchema>;
export type ChargePaidFrom = z.infer<typeof chargePaidFromSchema>;
