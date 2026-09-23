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
  // Trimmed, and an empty note is stored as null: « Ajouter une note » opened
  // then left blank is no note (F-18).
  note: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .transform((v) => (v === '' ? null : v)),
  paidFrom: accountKindSchema.default('vie_courante'),
});

/**
 * Creating an expense REQUIRES a category (F-6). The screen refuses first; this
 * is the same refusal on the server, since an action is a POST anyone can call.
 * Updates keep the nullable shape: rows written before F-6 may have none.
 */
export const expenseCreateSchema = expenseInputSchema.extend({
  categoryId: z.string().uuid({ message: 'expense.category.required' }),
});

export const expenseUpdateSchema = expenseInputSchema.partial();

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdate = z.infer<typeof expenseUpdateSchema>;
