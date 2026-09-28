import type { AccountKind, Money } from '@/lib/domain/types';
import { accountTypeFromKind } from './account-type';
import type { AccountFlow } from './solde';

/**
 * ADR-045 D22 — expenses and paid bills are flows of the derived balance: each
 * one leaves the account it was paid from. Pure: parsed rows in, flows out.
 *
 * Neither table carries `cancelled_at`: deleting an expense or unticking a bill
 * DELETES the row, so a flow that no longer exists is simply absent.
 *
 * A zero amount (allowed by both tables) is dropped: nothing left the account,
 * and `solde.ts` refuses a flow that is not strictly positive.
 */

/** A `date` column read at UTC midnight, the convention of `solde.ts`. */
function isoDay(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/**
 * The Brussels calendar day of an instant, as a UTC-midnight Date. A bill
 * ticked at 00:30 in Brussels belongs to that Brussels day, not to the UTC one.
 */
export function brusselsDay(instant: Date): Date {
  return isoDay(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(instant));
}

export function expenseToFlow(expense: {
  id: string;
  amount: Money;
  /** ISO day. */
  occurredOn: string;
  createdAt: Date;
  paidFrom: AccountKind;
}): AccountFlow | null {
  if (!expense.amount.gt(0)) return null;
  return {
    id: `expense:${expense.id}`,
    origin: 'expense',
    accountType: accountTypeFromKind(expense.paidFrom),
    direction: 'out',
    amount: expense.amount,
    occurredOn: isoDay(expense.occurredOn),
    recordedAt: expense.createdAt,
    cancelledAt: null,
  };
}

/**
 * A ticked bill (`charge_payments`) or commitment instalment
 * (`commitment_payments`). It ALWAYS leaves the bills account (`income_bills`),
 * decided by @thierry on 2026-09-28: `paid_from_account_type` names the account
 * that PROVISIONS the bill, not the one that pays it (ADR-041, and the column
 * comment of `20260810000002`). Reading it as the payer would debit the
 * provisions account, and the transfer that takes the money back would then
 * lower it a second time.
 *
 * Known limit, written in D22: `paid_at` is the instant the box was ticked, not
 * the day the bank debited it. A bill ticked late, after a balance that
 * already reflected it, is counted once more.
 */
export function billPaymentToFlow(payment: {
  id: string;
  source: 'charge' | 'commitment';
  amount: Money;
  paidAt: Date;
  createdAt: Date;
}): AccountFlow | null {
  if (!payment.amount.gt(0)) return null;
  return {
    id: `${payment.source}_payment:${payment.id}`,
    origin: 'bill',
    accountType: 'income_bills',
    direction: 'out',
    amount: payment.amount,
    occurredOn: brusselsDay(payment.paidAt),
    recordedAt: payment.createdAt,
    cancelledAt: null,
  };
}
