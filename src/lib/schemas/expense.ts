import { z } from 'zod';

import { accountKindSchema } from './account';

export const expenseInputSchema = z.object({
  label: z.string().trim().min(1, { message: 'Libellé requis' }).max(120),
  amount: z.number().finite().min(0).max(1_000_000),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format attendu: YYYY-MM-DD' }),
  categoryId: z.string().uuid().nullable(),
  note: z.string().max(500).nullable(),
  paidFrom: accountKindSchema.default('vie_courante'),
});

export const expenseUpdateSchema = expenseInputSchema.partial();

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type ExpenseUpdate = z.infer<typeof expenseUpdateSchema>;
