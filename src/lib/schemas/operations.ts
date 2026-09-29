import { z } from 'zod';

import { decalerMois, moisDeLaDate } from '@/lib/domain/accounts/mois-concerne';

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

/**
 * ADR-045 D21 — the answer to « Ton solde du … contient-il déjà cet argent ? »,
 * per account touched. Optional here: whether the question APPLIES depends on
 * the statements in the base, so the server decides, then parses the answers
 * again with `requiredStatementAnswersSchema`. An unknown account key is
 * refused, like every unknown key.
 */
export const STATEMENT_ANSWERS = ['included', 'notYet'] as const;
const statementAnswer = z.enum(STATEMENT_ANSWERS, { error: 'operations.sameDay.required' });
const statementAnswers = z.partialRecord(accountType, statementAnswer).optional();

/**
 * The answers the server REQUIRES: one per account whose latest standing
 * statement was read on the day of the operation. No default — an operation
 * without its answer is not written.
 */
export function requiredStatementAnswersSchema(
  accounts: ReadonlyArray<(typeof ACCOUNT_TYPES)[number]>,
) {
  return z.object(Object.fromEntries(accounts.map((a) => [a, statementAnswer])));
}

/**
 * ADR-045 D23 — the flow ids the domain builds (`<movement>:in|out`,
 * `expense:<id>`, `charge_payment:<id>`, `commitment_payment:<id>`). The SAME
 * pattern as the CHECK of `statement_included_flows.flow_id`: an id the base
 * would refuse is refused here first, with a readable error.
 */
export const FLOW_ID_PATTERN =
  /^((expense|charge_payment|commitment_payment):[0-9a-f-]{36}|[0-9a-f-]{36}:(in|out))$/;

/**
 * « Déjà dedans » / « Fait après », for ONE operation of the statement's day.
 * Only the two ids and the answer travel: the workspace and the author come
 * from the session.
 */
export const flowIncludedSchema = z
  .object({
    statementId: z.string().uuid({ message: 'operations.id.invalid' }),
    flowId: z.string().regex(FLOW_ID_PATTERN, { message: 'operations.id.invalid' }),
    included: z.boolean(),
  })
  .strict();

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
 * screen showed (ADR-045: never a reference). `plannedProvisions` is still
 * accepted from a screen loaded before tour 55, and IGNORED: the server splits
 * a transfer to the provisions with its own `provisionPartOfMonth`.
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
    plannedProvisions: nonNegativeCopy.optional(),
    statementAnswers,
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
    // Tour 42 (ADR-046) — the month this money counts for, `YYYY-MM`. Absent:
    // the month of the date. Bounded to one month either side of the date:
    // the screen never offers further, so a further value is not a choice.
    budgetMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'operations.budgetMonth.invalid' })
      .optional(),
    statementAnswers,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.budgetMonth === undefined) return;
    const m = moisDeLaDate(v.occurredOn);
    if (![decalerMois(m, -1), m, decalerMois(m, 1)].includes(v.budgetMonth)) {
      ctx.addIssue({
        code: 'custom',
        path: ['budgetMonth'],
        message: 'operations.budgetMonth.outOfRange',
      });
    }
  });

export type IncomeReceivedInput = z.infer<typeof incomeReceivedSchema>;

/** Cancel or reopen one row. Only the id and the wanted state travel. */
export const operationCancellationSchema = z
  .object({
    id: z.string().uuid({ message: 'operations.id.invalid' }),
    cancelled: z.boolean(),
  })
  .strict();

export type OperationCancellationInput = z.infer<typeof operationCancellationSchema>;

/**
 * Tour 57 — « Corriger le montant » of money received. Only the id and the new
 * amount travel: the date, the account, the write time and the month it counts
 * for stay as written (the base freezes the account and the write time,
 * ADR-045 D17). The amount follows the same rule as at entry.
 */
export const incomeAmountCorrectionSchema = z
  .object({
    id: z.string().uuid({ message: 'operations.id.invalid' }),
    amount: positiveAmount,
  })
  .strict();

export type IncomeAmountCorrectionInput = z.infer<typeof incomeAmountCorrectionSchema>;

/**
 * « Recalculer le découpage » — only the id travels. The split is the
 * server's (`splitByRule`): an amount or a share sent here is refused.
 */
export const transferSplitRecalculationSchema = z
  .object({ id: z.string().uuid({ message: 'operations.id.invalid' }) })
  .strict();
