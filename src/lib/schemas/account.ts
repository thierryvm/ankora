import { z } from 'zod';

export const accountKindSchema = z.enum(['principal', 'vie_courante', 'epargne'], {
  error: 'account.kind.invalid',
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
export type AccountBalanceInput = z.infer<typeof accountBalanceSchema>;
export type AccountLabelInput = z.infer<typeof accountLabelSchema>;

/**
 * Maps the DB `kind` (snake_case) to the i18n message sub-namespace (camelCase)
 * under `app.accounts.kind.*`.
 */
export const ACCOUNT_KIND_I18N_KEY: Record<AccountKind, 'principal' | 'vieCourante' | 'epargne'> = {
  principal: 'principal',
  vie_courante: 'vieCourante',
  epargne: 'epargne',
};
