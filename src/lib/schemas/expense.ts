import { z } from 'zod';

import { accountKindSchema } from './account';

export const expenseInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { message: 'expense.label.required' })
    .max(120, { message: 'expense.label.tooLong' }),
  amount: z
    .number({ error: 'expense.amount.invalid' })
    .finite({ message: 'expense.amount.invalid' })
    .min(0, { message: 'expense.amount.negative' })
    .max(1_000_000, { message: 'expense.amount.tooHigh' }),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'expense.date.format' }),
  categoryId: z.string().uuid({ message: 'expense.category.invalid' }).nullable(),
  note: z.string().max(500).nullable(),
  paidFrom: accountKindSchema.default('vie_courante'),
});

export const expenseUpdateSchema = expenseInputSchema.partial();

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type ExpenseUpdate = z.infer<typeof expenseUpdateSchema>;
