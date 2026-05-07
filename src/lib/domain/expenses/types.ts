import type { AccountKind, Money } from '@/lib/domain/types';

/**
 * Schedule-aware expense record (PR-D4 CRUD layer).
 *
 * Distinct from the legacy `Expense` type in `@/lib/domain/types` (consumed
 * by the cockpit math + workspace-snapshot). `ExpenseRecord` is the
 * canonical shape that the new CRUD layer (PR-D4) operates on — adds
 * `workspaceId` for authz checks and matches the DB row 1:1.
 */
export type ExpenseRecord = Readonly<{
  id: string;
  workspaceId: string;
  label: string;
  amount: Money;
  /** ISO date `YYYY-MM-DD` — when the expense actually occurred. */
  occurredOn: string;
  categoryId: string | null;
  note: string | null;
  paidFrom: AccountKind;
}>;

/**
 * Input shape accepted by `updateExpense()`. Each field optional;
 * `undefined` leaves the current value untouched.
 */
export type ExpenseUpdateInput = Readonly<{
  label?: string;
  amount?: Money;
  occurredOn?: string;
  categoryId?: string | null;
  note?: string | null;
  paidFrom?: AccountKind;
}>;
