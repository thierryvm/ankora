import { z } from 'zod';

export const accountKindSchema = z.enum(['principal', 'vie_courante', 'epargne'], {
  error: 'account.kind.invalid',
});

/**
 * ADR-008 canonical account type. Drives cockpit logic + UI typed cards (PR-D2+).
 * The `kind` enum above is legacy and will be deprecated post PR-D-final.
 */
export const accountTypeSchema = z.enum(['income_bills', 'provisions', 'daily_card'], {
  error: 'account.type.invalid',
});

/**
 * Display-name input shared by every rename surface. The regex blocks `<` / `>`
 * to keep the value HTML-safe end-to-end (Zod validates client-side AND
 * server-side; the rendered <input value> still relies on React escaping).
 */
export const accountDisplayNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'account.displayName.required' })
  .max(50, { message: 'account.displayName.tooLong' })
  .regex(/^[^<>]*$/, { message: 'account.displayName.invalidChars' });

export const accountRenameByTypeSchema = z.object({
  accountType: accountTypeSchema,
  displayName: accountDisplayNameSchema,
});

export const accountBalanceSchema = z.object({
  kind: accountKindSchema,
  balance: z
    .number({ error: 'account.balance.invalid' })
    .finite({ message: 'account.balance.invalid' })
    .min(-1_000_000_000_000, { message: 'account.balance.outOfRange' })
    .max(1_000_000_000_000, { message: 'account.balance.outOfRange' }),
});

export const accountLabelSchema = z.object({
  kind: accountKindSchema,
  label: z
    .string()
    .trim()
    .min(1, { message: 'account.label.required' })
    .max(60, { message: 'account.label.tooLong' }),
});

export type AccountKind = z.infer<typeof accountKindSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;
export type AccountBalanceInput = z.infer<typeof accountBalanceSchema>;
export type AccountLabelInput = z.infer<typeof accountLabelSchema>;
export type AccountRenameByTypeInput = z.infer<typeof accountRenameByTypeSchema>;

/**
 * Maps the DB `kind` (snake_case) to the i18n message sub-namespace (camelCase)
 * under `app.accounts.kind.*`.
 */
export const ACCOUNT_KIND_I18N_KEY: Record<AccountKind, 'principal' | 'vieCourante' | 'epargne'> = {
  principal: 'principal',
  vie_courante: 'vieCourante',
  epargne: 'epargne',
};
