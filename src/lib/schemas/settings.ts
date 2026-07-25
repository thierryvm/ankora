import { z } from 'zod';

import { normalizeEmail } from '@/lib/i18n/formatters';

/**
 * Profile form payload.
 *
 * `locale` is deliberately absent. The language preference has a single writer,
 * `setLocaleAction` — it writes the NEXT_LOCALE cookie, updates `users.locale`
 * AND revalidates the root layout, none of which `updateProfileAction` did.
 * Having two writers is what left the Settings selector unable to save anything
 * but `fr-BE`: it offered `fr-FR` / `en-GB`, neither of which is in `LOCALES`,
 * so every other choice failed validation with a generic toast — and even an
 * accepted `fr-BE` changed nothing on screen, since the rendered locale comes
 * from the URL prefix alone (cf. `src/i18n/routing.ts`).
 *
 * Keep this a plain `z.object`, NEVER `.strict()`. During a deploy, tabs still
 * running the previous bundle keep posting `{ displayName, locale }`; Zod
 * strips unknown keys, so they degrade gracefully. `.strict()` would reject
 * them outright, for tidiness nobody asked for.
 */
export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { message: 'settings.displayName.required' })
    .max(80, { message: 'settings.displayName.tooLong' }),
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
