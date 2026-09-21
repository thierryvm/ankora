import { z } from 'zod';

/**
 * Input schemas for the three account operations of PR C bis (ADR-045):
 * a balance statement, a planned transfer marked as done, money received.
 *
 * Every schema is `.strict()`: an unknown key is REFUSED, never ignored. The
 * workspace and the author come from the session (rule 3 of CLAUDE.md); a
 * client that sends `workspaceId` or `createdBy` gets an error rather than a
 * silent drop, so the attempt is visible in a test instead of looking like a
 * success.
 */

export const ACCOUNT_TYPES = ['income_bills', 'provisions', 'daily_card'] as const;
const accountType = z.enum(ACCOUNT_TYPES);

/** Cents are the smallest unit: a third decimal is refused, never rounded (ADR-045 D19). */
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'operations.date.invalid' })
  .refine(
    (value) => {
      const d = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
    },
    { message: 'operations.date.invalid' },
  );

/** Mirrors `movements.amount numeric(12,2) check (amount > 0 and amount <= 1e8)`. */
const positiveAmount = z
  .number({ error: 'operations.amount.invalid' })
  .finite({ message: 'operations.amount.invalid' })
  .gt(0, { message: 'operations.amount.notPositive' })
  .lte(100_000_000, { message: 'operations.amount.outOfRange' })
  .refine(hasAtMostTwoDecimals, { message: 'operations.amount.subCent' });

/** Mirrors `account_balance_statements.balance numeric(14,2)`. A negative balance is a fact. */
const signedBalance = z
  .number({ error: 'operations.amount.invalid' })
  .finite({ message: 'operations.amount.invalid' })
  .gte(-1_000_000_000_000, { message: 'operations.amount.outOfRange' })
  .lte(1_000_000_000_000, { message: 'operations.amount.outOfRange' })
  .refine(hasAtMostTwoDecimals, { message: 'operations.amount.subCent' });

const nonNegativeCopy = z
  .number({ error: 'operations.amount.invalid' })
  .finite({ message: 'operations.amount.invalid' })
  .gte(0, { message: 'operations.amount.outOfRange' })
  .lte(100_000_000, { message: 'operations.amount.outOfRange' })
  .refine(hasAtMostTwoDecimals, { message: 'operations.amount.subCent' });

export const balanceStatementSchema = z
  .object({
    accountType,
    balance: signedBalance,
    statedOn: isoDay,
  })
  .strict();

export type BalanceStatementInput = z.infer<typeof balanceStatementSchema>;

/**
 * « J'ai fait ce virement ». The three plan figures are a COPY of what the
 * screen showed (ADR-045: never a reference). `plannedProvisions` is the
 * month's provision share, used only to split a transfer TO the provisions
 * account into its two parts.
 */
export const plannedTransferSchema = z
  .object({
    fromAccountType: accountType,
    toAccountType: accountType,
    amount: positiveAmount,
    occurredOn: isoDay,
    planYear: z.number().int().min(2000).max(2100),
    planMonth: z.number().int().min(1).max(12),
    planSuggestedAmount: nonNegativeCopy,
    plannedProvisions: nonNegativeCopy,
  })
  .strict()
  .refine((v) => v.fromAccountType !== v.toAccountType, {
    message: 'operations.transfer.sameAccount',
    path: ['toAccountType'],
  });

export type PlannedTransferInput = z.infer<typeof plannedTransferSchema>;

export const incomeReceivedSchema = z
  .object({
    toAccountType: accountType,
    amount: positiveAmount,
    occurredOn: isoDay,
    nature: z.enum(['regular', 'extra']),
    // Optional on screen; the action writes a default in the person's language
    // when it is empty, because the schema requires one for an income.
    description: z
      .string()
      .trim()
      .max(120, { message: 'operations.description.tooLong' })
      .optional(),
  })
  .strict();

export type IncomeReceivedInput = z.infer<typeof incomeReceivedSchema>;

/** Cancel or reopen one row. Only the id and the wanted state travel. */
export const operationCancellationSchema = z
  .object({
    id: z.string().uuid({ message: 'operations.id.invalid' }),
    cancelled: z.boolean(),
  })
  .strict();

export type OperationCancellationInput = z.infer<typeof operationCancellationSchema>;
