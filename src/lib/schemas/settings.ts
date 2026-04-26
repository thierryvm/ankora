import { z } from 'zod';

import { LOCALES } from '@/i18n/routing';
import { normalizeEmail } from '@/lib/i18n/formatters';

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

/**
 * Deletion confirmation schema — factory pattern.
 *
 * i18n-safe: the user must type their own email address (case-insensitive,
 * trimmed) rather than a translated keyword. This avoids:
 *   - backend drift when adding locales (no z.union to maintain)
 *   - grammar pitfalls per locale (VERWIJDER vs VERWIJDEREN, etc.)
 *   - cross-locale support ambiguity
 *
 * Pattern inspired by GitHub / Vercel / Linear destructive-action confirmations.
 */
export const makeDeletionRequestSchema = (expectedEmail: string) =>
  z.object({
    reason: z.string().trim().max(500).optional(),
    confirm: z
      .string()
      .trim()
      .refine((v) => normalizeEmail(v) === normalizeEmail(expectedEmail), {
        message: 'settings.deletion.confirm',
      }),
  });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type DeletionRequestInput = z.infer<ReturnType<typeof makeDeletionRequestSchema>>;
