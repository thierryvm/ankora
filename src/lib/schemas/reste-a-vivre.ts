import { z } from 'zod';

/**
 * Reste-à-vivre per-month override schema. The "Ajuster ce mois" drawer
 * (PR-BETA-3, ADR-009 R-10) writes one entry into
 * `workspace_settings.reste_a_vivre_overrides` keyed by `YYYY-MM`.
 *
 * Bounds rationale:
 *  - 0 € minimum: a user may legitimately budget zero "vie courante" for a
 *    month (e.g. while travelling and bills are pre-paid). Negative values
 *    are nonsense and would break the tryptique math.
 *  - 100 000 € maximum: defensive upper bound matching the DB CHECK
 *    constraint (`workspace_settings_reste_a_vivre_default_range`). Above
 *    this we assume an input typo and reject early.
 *
 * The regex enforces ISO-ish `YYYY-MM` with month in 01..12. We deliberately
 * do NOT allow `YYYY-M` (single-digit month) to keep the JSONB key shape
 * canonical.
 */
export const resteAVivreMonthOverrideSchema = z.object({
  monthYYYYMM: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
  montant: z.number().finite().min(0).max(100000),
});

export type ResteAVivreMonthOverrideInput = z.infer<typeof resteAVivreMonthOverrideSchema>;
