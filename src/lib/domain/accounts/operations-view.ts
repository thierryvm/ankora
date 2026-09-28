import type { AccountType } from '@/lib/domain/cockpit/types';
import { money, zero, type Money } from '@/lib/domain/types';
import {
  compareStatementOrder,
  deriveAccountBalance,
  flowCountsAfterStatement,
  measureStatementGap,
  selectLatestStatement,
  type AccountBalanceStatement,
  type AccountFlow,
  type FlowContribution,
  type FlowOrigin,
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
  /**
   * Tour 42 (ADR-046) — the month an income counts for. Both null: the month
   * of its date. Never read for a balance: a balance moves at the DATE.
   */
  budgetYear: number | null;
  budgetMonth: number | null;
  description: string | null;
};

/**
 * One movement is one or two flows: a transfer leaves one account and reaches
 * another, an income only reaches one. The id is suffixed so the two halves of
 * a transfer stay distinguishable in a decomposition.
 */
export function movementToFlows(movement: MovementRecord): AccountFlow[] {
  const base = {
    origin: movement.kind,
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
  /**
   * Latest statement versus the one before it, when both exist. `lines` opens
   * the expected balance (rule 10); `difference` is `read - expected`, the way
   * a person reads it: negative when the account holds LESS than expected.
   */
  gap: (StatementGap & { lines: ExpectedLines; difference: Money }) | null;
  /** The most recent cancelled statement, offered for reopening (rule 11). */
  reopenable: AccountBalanceStatement | null;
  /**
   * ADR-045 D21 — the operations of the READ statement's own day, written after
   * it, that the hour rule counts on top of it. Null when there are none, or
   * when the statement is the starting balance (never rewritten). `total` is
   * signed: an outgoing transfer lowers it.
   */
  sameDayAfter: { total: Money; flows: readonly AccountFlow[] } | null;
};

export function accountBalanceView(input: {
  accountType: AccountType;
  statements: readonly AccountBalanceStatement[];
  movements: readonly MovementRecord[];
  /** ADR-045 D22 — expenses and paid bills, already turned into outflows. */
  debits: readonly AccountFlow[];
  today: Date;
}): AccountBalanceView | null {
  const { accountType, statements, today } = input;
  const read = selectLatestStatement(statements, accountType);
  if (read === null) return null;

  const flows = ledgerFlows(input.movements, input.debits);
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
    gap:
      gap && !gap.gap.isZero()
        ? {
            ...gap,
            lines: expectedLines(gap, startingStatementId(statements, accountType)),
            difference: gap.declared.minus(gap.derived),
          }
        : null,
    reopenable,
    sameDayAfter: sameDayAfterView(statements, read, flows),
  };
}

function sameDayAfterView(
  statements: readonly AccountBalanceStatement[],
  read: AccountBalanceStatement,
  flows: readonly AccountFlow[],
): AccountBalanceView['sameDayAfter'] {
  if (sameDayStatement(statements, read.accountType, read.statedOn) === null) return null;
  const sameDay = sameDayFlowsAfter(read, flows);
  if (sameDay.length === 0) return null;
  const total = sameDay.reduce(
    (sum, f) => (f.direction === 'in' ? sum.plus(f.amount) : sum.minus(f.amount)),
    zero(),
  );
  return { total, flows: sameDay };
}

/**
 * ADR-045 D21 — the statement a same-day operation can be counted twice
 * against: the latest standing statement of the account, when it was read on
 * `day`. Null otherwise, and null for the starting balance: `startingStatementId`
 * reads cancelled rows too, so a rewritten copy would lose that status and
 * become cancellable — the one statement an account must always keep.
 */
export function sameDayStatement(
  statements: readonly AccountBalanceStatement[],
  accountType: AccountType,
  day: Date,
): AccountBalanceStatement | null {
  const latest = selectLatestStatement(statements, accountType);
  if (latest === null || latest.statedOn.getTime() !== day.getTime()) return null;
  if (startingStatementId(statements, accountType) === latest.id) return null;
  return latest;
}

/**
 * Per account, the statement a same-day operation can be counted twice
 * against — the latest standing one, unless it is the starting balance. The
 * screens ask their D21 question when the operation's date equals its day.
 */
export function rewritableStatements(
  statements: readonly AccountBalanceStatement[],
  accountTypes: readonly AccountType[],
): Partial<Record<AccountType, AccountBalanceStatement>> {
  const out: Partial<Record<AccountType, AccountBalanceStatement>> = {};
  for (const a of accountTypes) {
    const latest = selectLatestStatement(statements, a);
    const s = latest ? sameDayStatement(statements, a, latest.statedOn) : null;
    if (s) out[a] = s;
  }
  return out;
}

/**
 * The flows of the statement's own day that the hour rule (D16) counts after
 * it — written later the same day, not cancelled. A flow of a LATER day is
 * never here: that one counts, and rightly.
 */
export function sameDayFlowsAfter(
  statement: AccountBalanceStatement,
  flows: readonly AccountFlow[],
): AccountFlow[] {
  return flows.filter(
    (f) =>
      f.accountType === statement.accountType &&
      f.cancelledAt === null &&
      f.occurredOn.getTime() === statement.statedOn.getTime() &&
      flowCountsAfterStatement(statement, f),
  );
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
  debits: readonly AccountFlow[];
  statedOn: Date;
}): Money | null {
  const anchor = selectLatestStatement(
    input.statements.filter((s) => s.statedOn.getTime() <= input.statedOn.getTime()),
    input.accountType,
  );
  if (anchor === null) return null;
  return deriveAccountBalance({
    statement: anchor,
    flows: ledgerFlows(input.movements, input.debits),
    asOf: input.statedOn,
  }).balance;
}

/**
 * Every flow of the ledger (ADR-045 D22): the journal's movements, and the
 * expenses and paid bills that leave an account. One list, so that the
 * balance, the gap, the same-day question and the stored `derived_balance`
 * can never read two different sets.
 */
export function ledgerFlows(
  movements: readonly MovementRecord[],
  debits: readonly AccountFlow[],
): AccountFlow[] {
  return [...movements.flatMap(movementToFlows), ...debits];
}

/** The expected balance of a gap, opened on its lines (rule 10). */
export type ExpectedLines = {
  from: { statedOn: Date; balance: Money; isStart: boolean };
  received: Money;
  transfersIn: Money;
  transfersOut: Money;
  bills: Money;
  expenses: Money;
  /** `from + received + transfersIn - transfersOut - bills - expenses`. */
  expected: Money;
};

type LineKey = 'received' | 'transfersIn' | 'transfersOut' | 'bills' | 'expenses';

function lineOf(origin: FlowOrigin | undefined, direction: 'in' | 'out'): LineKey {
  if (origin === 'income' && direction === 'in') return 'received';
  if (origin === 'transfer') return direction === 'in' ? 'transfersIn' : 'transfersOut';
  if (origin === 'bill' && direction === 'out') return 'bills';
  if (origin === 'expense' && direction === 'out') return 'expenses';
  throw new RangeError(`a flow of origin ${String(origin)} (${direction}) has no line`);
}

/**
 * Groups the contributions the gap ALREADY summed — never a second read — so
 * the lines cannot drift from the figure they explain. A flow no line can name
 * throws, and so does a sum that would not add up: loud beats plausible.
 */
export function expectedLines(gap: StatementGap, startingId: string | null): ExpectedLines {
  const sums: Record<LineKey, Money> = {
    received: zero(),
    transfersIn: zero(),
    transfersOut: zero(),
    bills: zero(),
    expenses: zero(),
  };
  for (const c of gap.contributions) {
    const key = lineOf(c.flow.origin, c.flow.direction);
    sums[key] = sums[key].plus(c.flow.amount);
  }
  const expected = gap.anchor.balance
    .plus(sums.received)
    .plus(sums.transfersIn)
    .minus(sums.transfersOut)
    .minus(sums.bills)
    .minus(sums.expenses);
  if (!expected.eq(gap.derived)) {
    throw new RangeError('the lines of the expected balance do not add up to it');
  }
  return {
    from: {
      statedOn: gap.anchor.statedOn,
      balance: gap.anchor.balance,
      isStart: gap.anchor.id === startingId,
    },
    ...sums,
    expected,
  };
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
