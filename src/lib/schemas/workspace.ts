import { z } from 'zod';

export const workspaceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'workspace.name.required' })
    .max(80, { message: 'workspace.name.tooLong' }),
  currency: z.enum(['EUR', 'USD', 'GBP', 'CHF']).default('EUR'),
  monthlyIncome: z
    .number({ error: 'workspace.income.invalid' })
    .finite({ message: 'workspace.income.invalid' })
    .min(0, { message: 'workspace.income.negative' })
    .max(10_000_000, { message: 'workspace.income.tooHigh' })
    .nullable(),
  fiscalMonthStart: z.number().int().min(1).max(28).default(1),
  vieCouranteMonthlyTransfer: z
    .number()
    .finite({ message: 'workspace.transfer.invalid' })
    .min(0, { message: 'workspace.transfer.negative' })
    .max(100_000_000, { message: 'workspace.transfer.tooHigh' })
    .nullable()
    .optional(),
});

export const workspaceUpdateSchema = workspaceInputSchema.partial();

export const monthlyIncomeSchema = z.object({
  monthlyIncome: z
    .number({ error: 'workspace.income.invalid' })
    .finite({ message: 'workspace.income.invalid' })
    .min(0, { message: 'workspace.income.negative' })
    .max(10_000_000, { message: 'workspace.income.tooHigh' })
    .nullable(),
});

export const vieCouranteTransferSchema = z.object({
  amount: z
    .number({ error: 'workspace.transfer.invalid' })
    .finite({ message: 'workspace.transfer.invalid' })
    .min(0, { message: 'workspace.transfer.negative' })
    .max(100_000_000, { message: 'workspace.transfer.tooHigh' })
    .nullable(),
});

export type WorkspaceInput = z.infer<typeof workspaceInputSchema>;
export type WorkspaceUpdate = z.infer<typeof workspaceUpdateSchema>;
