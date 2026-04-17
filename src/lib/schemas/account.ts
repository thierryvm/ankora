import { z } from 'zod';

export const accountKindSchema = z.enum(['principal', 'vie_courante', 'epargne']);

export const accountBalanceSchema = z.object({
  kind: accountKindSchema,
  balance: z
    .number({ error: 'Solde invalide' })
    .finite()
    .min(-1_000_000_000_000, { message: 'Valeur hors limites' })
    .max(1_000_000_000_000, { message: 'Valeur hors limites' }),
});

export const accountLabelSchema = z.object({
  kind: accountKindSchema,
  label: z.string().trim().min(1, { message: 'Libellé requis' }).max(60),
});

export type AccountKind = z.infer<typeof accountKindSchema>;
export type AccountBalanceInput = z.infer<typeof accountBalanceSchema>;
export type AccountLabelInput = z.infer<typeof accountLabelSchema>;

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  principal: 'Compte Principal',
  vie_courante: 'Vie Courante',
  epargne: 'Épargne & Provisions',
};

export const ACCOUNT_KIND_DESCRIPTIONS: Record<AccountKind, string> = {
  principal: 'Reçoit le salaire, paye les charges fixes mensuelles.',
  vie_courante: 'Budget du quotidien (courses, essence, restos).',
  epargne: 'Lisse les factures trimestrielles et annuelles.',
};
