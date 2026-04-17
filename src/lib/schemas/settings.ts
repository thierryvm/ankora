import { z } from 'zod';

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { message: 'Nom requis' })
    .max(80, { message: 'Maximum 80 caractères' }),
  locale: z.enum(['fr-BE', 'fr-FR', 'en-GB']).default('fr-BE'),
});

export const factorIdSchema = z.string().uuid({ message: 'Identifiant invalide' });

export const mfaVerifySchema = z.object({
  factorId: factorIdSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { message: 'Code à 6 chiffres' }),
});

export const deletionRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  confirm: z.literal('SUPPRIMER', {
    message: 'Tape « SUPPRIMER » pour confirmer',
  }),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type DeletionRequestInput = z.infer<typeof deletionRequestSchema>;
