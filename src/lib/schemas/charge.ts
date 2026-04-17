import { z } from 'zod';

export const chargeFrequencySchema = z.enum(['monthly', 'quarterly', 'semiannual', 'annual']);

export const chargeInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { message: 'Libellé requis' })
    .max(120, { message: 'Maximum 120 caractères' }),
  amount: z
    .number({ error: 'Montant invalide' })
    .finite()
    .min(0, { message: 'Doit être ≥ 0' })
    .max(1_000_000, { message: 'Montant trop élevé' }),
  frequency: chargeFrequencySchema,
  dueMonth: z
    .number()
    .int()
    .min(1, { message: 'Mois entre 1 et 12' })
    .max(12, { message: 'Mois entre 1 et 12' }),
  categoryId: z.string().uuid().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().max(500).optional().nullable(),
});

export const chargeUpdateSchema = chargeInputSchema.partial();

export type ChargeInput = z.infer<typeof chargeInputSchema>;
export type ChargeUpdate = z.infer<typeof chargeUpdateSchema>;
