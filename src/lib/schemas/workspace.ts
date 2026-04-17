import { z } from 'zod';

export const workspaceInputSchema = z.object({
  name: z.string().trim().min(1, { message: 'Nom requis' }).max(80),
  currency: z.enum(['EUR', 'USD', 'GBP', 'CHF']).default('EUR'),
  monthlyIncome: z.number().finite().min(0).max(10_000_000).nullable(),
  fiscalMonthStart: z.number().int().min(1).max(28).default(1),
  vieCouranteMonthlyTransfer: z.number().finite().min(0).max(100_000_000).nullable().optional(),
});

export const workspaceUpdateSchema = workspaceInputSchema.partial();

export const monthlyIncomeSchema = z.object({
  monthlyIncome: z
    .number({ error: 'Revenu invalide' })
    .finite()
    .min(0, { message: 'Doit être ≥ 0' })
    .max(10_000_000)
    .nullable(),
});

export const vieCouranteTransferSchema = z.object({
  amount: z
    .number({ error: 'Montant invalide' })
    .finite()
    .min(0, { message: 'Doit être ≥ 0' })
    .max(100_000_000)
    .nullable(),
});

export type WorkspaceInput = z.infer<typeof workspaceInputSchema>;
export type WorkspaceUpdate = z.infer<typeof workspaceUpdateSchema>;
