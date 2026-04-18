import { z } from 'zod';

import { LOCALES } from '@/i18n/routing';

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { message: 'settings.displayName.required' })
    .max(80, { message: 'settings.displayName.tooLong' }),
  locale: z.enum(LOCALES, { error: 'settings.locale.invalid' }).default('fr-BE'),
});

export const factorIdSchema = z.string().uuid({ message: 'settings.factorId.invalid' });

export const mfaVerifySchema = z.object({
  factorId: factorIdSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { message: 'settings.mfaCode.invalid' }),
});

export const deletionRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  confirm: z.literal('SUPPRIMER', {
    message: 'settings.deletion.confirm',
  }),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type DeletionRequestInput = z.infer<typeof deletionRequestSchema>;
