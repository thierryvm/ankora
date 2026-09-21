import type { AccountType } from '@/lib/domain/cockpit/types';
import { money, zero, type Money } from '@/lib/domain/types';
import {
  compareStatementOrder,
  deriveAccountBalance,
  measureStatementGap,
  selectLatestStatement,
  type AccountBalanceStatement,
  type AccountFlow,
  type FlowContribution,
  type StatementGap,
} from './solde';

/**
 * What the screens of PR C bis read from the journal (ADR-045). Pure: rows in,
 * view out. The arithmetic stays in `solde.ts`; this module only decides WHICH
 * statement, WHICH flows, and what a line of the monthly transfer plan says.
 */

/** A `movements` row, already parsed (dates as Date, amounts as Money). */
export type MovementRecord = {
  id: string;
  kind: 'transfer' | 'income';
  fromAccountType: AccountType | null;
  toAccountType: AccountType | null;
  amount: Money;
  occurredOn: Date;
  recordedAt: Date;
  cancelledAt: Date | null;
  planYear: number | null;
  planMonth: number | null;
  planSuggestedAmount: Money | null;
  provisionPart: Money | null;
  freeSavingsPart: Money | null;
  incomeNature: 'regular' | 'extra' | null;
  description: string | null;
};

/**
 * One movement is one or two flows: a transfer leaves one account and reaches
 * another, an income only reaches one. The id is suffixed so the two halves of
 * a transfer stay distinguishable in a decomposition.
 */
export function movementToFlows(movement: MovementRecord): AccountFlow[] {
  const base = {
    amount: movement.amount,
    occurredOn: movement.occurredOn,
    recordedAt: movement.recordedAt,
    cancelledAt: movement.cancelledAt,
  };
  const flows: AccountFlow[] = [];
  if (movement.fromAccountType !== null) {
    flows.push({
      ...base,
      id: `${movement.id}:out`,
      accountType: movement.fromAccountType,
      direction: 'out',
    });
  }
  if (movement.toAccountType !== null) {
    flows.push({
      ...base,
      id: `${movement.id}:in`,
      accountType: movement.toAccountType,
      direction: 'in',
    });
  }
  return flows;
}

/**
 * The split of a transfer TO the provisions account (ADR-038 D4, decided by
 * @thierry on 2026-09-21): the month's provisions first, capped at the amount
 * transferred, the rest is free savings. Anywhere else there is no split.
 */
export function splitTransferToProvisions(
  amount: Money,
  plannedProvisions: Money,
): { provisionPart: Money; freeSavingsPart: Money } {
  const cap = plannedProvisions.lt(0) ? zero() : plannedProvisions;
  const provisionPart = amount.lt(cap) ? amount : cap;
  return { provisionPart, freeSavingsPart: amount.minus(provisionPart) };
}

/**
 * The FIRST statement of an account is its starting balance — seeded by the J2
 * migration or by the sign-up trigger, never read on a bank extract. It keeps
 * that name even once cancelled: a later statement is what someone read.
 */
export function startingStatementId(
  statements: readonly AccountBalanceStatement[],
  accountType: AccountType,
): string | null {
  let first: AccountBalanceStatement | null = null;
  for (const s of statements) {
    if (s.accountType !== accountType) continue;
    if (first === null || compareStatementOrder(s, first) < 0) first = s;
  }
  return first?.id ?? null;
}

export type AccountBalanceView = {
  accountType: AccountType;
  /** The latest non-cancelled statement: a READ balance, dated by its `statedOn`. */
  read: AccountBalanceStatement;
  readIsStartingBalance: boolean;
  /** Read balance + operations since. Null when no operation happened since. */
  computed: { balance: Money; contributions: readonly FlowContribution[] } | null;
  /** Latest statement versus the one before it, when both exist. */
  gap: StatementGap | null;
  /** The most recent cancelled statement, offered for reopening (rule 11). */
  reopenable: AccountBalanceStatement | null;
};

export function accountBalanceView(input: {
  accountType: AccountType;
  statements: readonly AccountBalanceStatement[];
  movements: readonly MovementRecord[];
  today: Date;
}): AccountBalanceView | null {
  const { accountType, statements, today } = input;
  const read = selectLatestStatement(statements, accountType);
  if (read === null) return null;

  const flows = input.movements.flatMap(movementToFlows);
  const asOf = today.getTime() < read.statedOn.getTime() ? read.statedOn : today;
  const derived = deriveAccountBalance({ statement: read, flows, asOf });

  const previous = selectLatestStatement(
    statements.filter((s) => s.id !== read.id && compareStatementOrder(s, read) < 0),
    accountType,
  );
  const gap = previous ? measureStatementGap({ statement: read, anchor: previous, flows }) : null;

  let reopenable: AccountBalanceStatement | null = null;
  for (const s of statements) {
    // Not only those newer than `read`: with A, B, C, cancelling C then B then
    // reopening C would otherwise leave B cancelled for good (relecture du
    // 2026-09-21).
    if (s.accountType !== accountType || s.cancelledAt === null) continue;
    if (reopenable === null || compareStatementOrder(s, reopenable) > 0) reopenable = s;
  }

  return {
    accountType,
    read,
    readIsStartingBalance: startingStatementId(statements, accountType) === read.id,
    computed:
      derived.contributions.length > 0
        ? { balance: derived.balance, contributions: derived.contributions }
        : null,
    gap: gap && !gap.gap.isZero() ? gap : null,
    reopenable,
  };
}

/**
 * The balance a new statement is expected to show, written as its
 * `derived_balance` (the J2 migration leaves it to the screens, l. 707): the
 * latest statement on or before that day, plus the operations since.
 */
export function expectedBalanceOn(input: {
  accountType: AccountType;
  statements: readonly AccountBalanceStatement[];
  movements: readonly MovementRecord[];
  statedOn: Date;
}): Money | null {
  const anchor = selectLatestStatement(
    input.statements.filter((s) => s.statedOn.getTime() <= input.statedOn.getTime()),
    input.accountType,
  );
  if (anchor === null) return null;
  return deriveAccountBalance({
    statement: anchor,
    flows: input.movements.flatMap(movementToFlows),
    asOf: input.statedOn,
  }).balance;
}

export type PlannedTransferLine =
  { state: 'done'; movement: MovementRecord } | { state: 'todo'; cancelled: MovementRecord | null };

/**
 * One line of the monthly plan: done when a non-cancelled transfer of that plan
 * month exists between the same two accounts. A cancelled one is kept, so the
 * line can offer to reopen it at the same place (rule 11).
 */
export function plannedTransferLine(input: {
  movements: readonly MovementRecord[];
  fromAccountType: AccountType;
  toAccountType: AccountType;
  planYear: number;
  planMonth: number;
}): PlannedTransferLine {
  let active: MovementRecord | null = null;
  let cancelled: MovementRecord | null = null;
  for (const m of input.movements) {
    if (m.kind !== 'transfer') continue;
    if (m.fromAccountType !== input.fromAccountType || m.toAccountType !== input.toAccountType)
      continue;
    if (m.planYear !== input.planYear || m.planMonth !== input.planMonth) continue;
    const slot = m.cancelledAt === null ? active : cancelled;
    if (slot === null || m.recordedAt.getTime() > slot.recordedAt.getTime()) {
      if (m.cancelledAt === null) active = m;
      else cancelled = m;
    }
  }
  return active ? { state: 'done', movement: active } : { state: 'todo', cancelled };
}

/** Parses the numeric columns PostgREST returns as strings or numbers. */
export function toMoney(value: string | number): Money {
  return money(value);
}
