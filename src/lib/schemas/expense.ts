import { z } from 'zod';

import { accountKindSchema } from './account';
import { partialWithoutDefaults } from './partial-update';

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
  // F-6 — required, and never null. An expense recorded « without a category »
  // was in practice filed under whatever chip happened to be pre-selected; the
  // refusal lives at the boundary so no caller can write one by omission. A
  // missing key and an explicit null both mean « not chosen », hence one message.
  categoryId: z
    .string({
      error: (issue) =>
        issue.input === undefined || issue.input === null
          ? 'expense.category.required'
          : 'expense.category.invalid',
    })
    .uuid({ message: 'expense.category.invalid' }),
  note: z.string().max(500).nullable(),
  paidFrom: accountKindSchema.default('vie_courante'),
});

// Partial: an update may leave the category alone — an expense recorded before
// F-6 without one stays editable on its other fields — but it can never set it
// to null, since the field above does not accept null. Derived without the
// create default, so an absent `paidFrom` leaves the account alone.
export const expenseUpdateSchema = partialWithoutDefaults(expenseInputSchema);

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type ExpenseUpdate = z.infer<typeof expenseUpdateSchema>;
