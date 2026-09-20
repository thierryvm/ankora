import type { AccountType } from '@/lib/domain/cockpit/types';
import { zero, type Money } from '@/lib/domain/types';

/**
 * A balance the person read somewhere and wrote down, at a date.
 *
 * Mirrors `public.account_balance_statements`. Two of its columns exist only to
 * be compared, and the reason belongs next to the type: `statedOn` is the DAY
 * the balance is true of, `recordedAt` the INSTANT the line was written. They
 * do not derive from one another — a balance read on the 17th is commonly typed
 * on the 20th — and the whole hour rule below rests on the second one
 * (ADR-045 D16).
 */
export type AccountBalanceStatement = {
  id: string;
  accountType: AccountType;
  balance: Money;
  statedOn: Date;
  recordedAt: Date;
  /** ADR-045 D15: an operation is cancelled, it is never erased. */
  cancelledAt: Date | null;
};

/**
 * One movement of money on one account, already dated and already attributed.
 *
 * The sign lives in `direction`, never in `amount` — a signed amount makes
 * « −80 € out » and « 80 € in » two spellings of the same thing, and the day one
 * of them slips through, a balance moves twice in opposite directions while the
 * total stays right. That is the hardest kind of wrong to notice, which is why
 * `account-type.ts` refuses the same class of ambiguity.
 *
 * `recordedAt` is nullable HERE and not on a statement: J4 will also derive from
 * `expenses`, `charge_payments` and `commitment_payments`, which predate the
 * journal and carry no write instant. The new tables all have
 * `recorded_at not null`.
 */
export type AccountFlow = {
  id: string;
  accountType: AccountType;
  direction: 'in' | 'out';
  /** Strictly positive. The direction carries the sign. */
  amount: Money;
  occurredOn: Date;
  recordedAt: Date | null;
  cancelledAt: Date | null;
};

/** One line of the decomposition of a derived balance. */
export type FlowContribution = {
  flow: AccountFlow;
  /** `+amount` for an inflow, `−amount` for an outflow. */
  signedAmount: Money;
};

export type DeriveAccountBalanceInput = {
  statement: AccountBalanceStatement;
  flows: readonly AccountFlow[];
  /** The date the balance is asked for. A flow occurring ON it counts. */
  asOf: Date;
};

export type DerivedAccountBalance = {
  accountType: AccountType;
  /** The statement the figure was derived FROM — it travels with the total. */
  anchor: AccountBalanceStatement;
  balance: Money;
  netFlow: Money;
  /** `anchor.balance` plus these IS `balance` — asserted by test, not by comment. */
  contributions: readonly FlowContribution[];
};

export type StatementGapInput = {
  /** The statement being measured — the declared figure. */
  statement: AccountBalanceStatement;
  /** The statement to derive from: same account, strictly earlier. */
  anchor: AccountBalanceStatement;
  flows: readonly AccountFlow[];
};

export type StatementGap = {
  accountType: AccountType;
  statement: AccountBalanceStatement;
  anchor: AccountBalanceStatement;
  /** What the person read on the statement. */
  declared: Money;
  /** What the journal says it should have been. */
  derived: Money;
  /** `derived − declared`. Positive: spending that was never written down. */
  gap: Money;
  netFlow: Money;
  contributions: readonly FlowContribution[];
};

/**
 * Refuses an unusable `Date` instead of deriving from `NaN`.
 *
 * Every comparison against an invalid date returns `false`, so an unchecked one
 * does not crash: it silently drops flows and returns a balance that looks
 * perfectly ordinary. That is the failure mode this module can least afford —
 * loud beats plausible, for the same reason `account-type.ts` throws rather than
 * falling back.
 */
function assertRealDate(value: Date, label: string): Date {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError(`${label} is not a usable date`);
  }
  return value;
}

/** Byte order on ids, matching the SQL tiebreaker. Returns exactly 0 on a tie. */
function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * The total order of statements — `(stated_on, recorded_at, id)`, oldest first.
 *
 * Two statements of the same account on the same day are legitimate: that is how
 * a typo gets corrected without erasing anything (rule 11 of `CLAUDE.md`). So
 * « the latest » needs a tiebreaker that always decides. `recorded_at` settles
 * the same-day case, and `id` settles the case of two rows written in the same
 * transaction, which share `now()` down to the microsecond. Without the third
 * column the answer would depend on the order the rows came back in — which is
 * not an order at all, only an appearance of one.
 *
 * Same three columns, same direction as the index `20260920000001:385`. A second
 * ordering, written here by hand, would drift from that one in silence.
 */
export function compareStatementOrder(
  a: AccountBalanceStatement,
  b: AccountBalanceStatement,
): number {
  const byDay = a.statedOn.getTime() - b.statedOn.getTime();
  if (byDay !== 0) return byDay;

  const byInstant = a.recordedAt.getTime() - b.recordedAt.getTime();
  if (byInstant !== 0) return byInstant;

  return compareIds(a.id, b.id);
}

/**
 * The latest non-cancelled statement of ONE account, or `null`.
 *
 * `null` is a normal answer, not a failure: an account whose balance has never
 * been read has nothing to derive from, and the caller has to say so rather than
 * show a 0 — which reads as « empty account », a different claim entirely.
 */
export function selectLatestStatement(
  statements: readonly AccountBalanceStatement[],
  accountType: AccountType,
): AccountBalanceStatement | null {
  let latest: AccountBalanceStatement | null = null;

  for (const statement of statements) {
    if (statement.accountType !== accountType) continue;
    if (statement.cancelledAt !== null) continue;
    if (latest === null || compareStatementOrder(statement, latest) > 0) {
      latest = statement;
    }
  }

  return latest;
}

/**
 * The hour rule (ADR-045 D16). A flow counts against a statement when:
 *
 *   - it happened AFTER the statement day; or
 *   - it happened the SAME day, and was written after the statement was.
 *
 * Equal instants do not count: the statement already saw it. A same-day flow
 * carrying NO write instant does not count either — nothing can order it, and
 * the conservative reading is « the balance I read already included it », which
 * under-counts instead of inventing money.
 *
 * Both ends of a reconciliation window go through this one function, and that is
 * the entire point of having it: a window whose two bounds disagree on what
 * « after » means loses or double-counts exactly the rows written on a boundary
 * day — the rows nobody thinks to check.
 */
export function flowCountsAfterStatement(
  statement: AccountBalanceStatement,
  flow: AccountFlow,
): boolean {
  const flowDay = flow.occurredOn.getTime();
  const statementDay = statement.statedOn.getTime();

  if (flowDay > statementDay) return true;
  if (flowDay < statementDay) return false;

  if (flow.recordedAt === null) return false;
  return flow.recordedAt.getTime() > statement.recordedAt.getTime();
}

/**
 * The flows of ONE account falling strictly after `anchor` and inside the upper
 * bound the caller decides — a date for a live balance, a closing statement for
 * a reconciliation.
 *
 * Input order is preserved: the caller reads its rows with an `ORDER BY`, and
 * the decomposition it gets back must be the list it asked for, not one this
 * module re-invents.
 */
function collectContributions(
  anchor: AccountBalanceStatement,
  flows: readonly AccountFlow[],
  isWithinUpperBound: (flow: AccountFlow) => boolean,
): FlowContribution[] {
  const contributions: FlowContribution[] = [];

  for (const flow of flows) {
    if (flow.accountType !== anchor.accountType) continue;
    // ADR-045 D15: a cancelled line stays readable and stops counting.
    if (flow.cancelledAt !== null) continue;

    assertRealDate(flow.occurredOn, `flow ${flow.id}: occurredOn`);

    if (!isWithinUpperBound(flow)) continue;
    if (!flowCountsAfterStatement(anchor, flow)) continue;

    if (!flow.amount.gt(0)) {
      throw new RangeError(
        `flow ${flow.id}: amount must be strictly positive — the direction carries the sign`,
      );
    }

    contributions.push({
      flow,
      signedAmount: flow.direction === 'in' ? flow.amount : flow.amount.negated(),
    });
  }

  return contributions;
}

function sumContributions(contributions: readonly FlowContribution[]): Money {
  let total = zero();
  for (const contribution of contributions) {
    total = total.plus(contribution.signedAmount);
  }
  return total;
}

/**
 * The balance of one account at a date: a statement, plus what happened after.
 *
 * ## Why the decomposition comes back with the total
 *
 * Rule 10 of `CLAUDE.md`. A caller given only `balance` has to re-query the
 * flows to explain it, and that second list will eventually not be the one this
 * function summed — a slightly different window, a cancelled row still in — so
 * the explanation quietly stops adding up to the figure it explains. The
 * decomposition descends WITH the number, or it diverges from it.
 *
 * ## Why it throws instead of returning a best effort
 *
 * A wrong balance is indistinguishable from a right one on screen. `asOf` before
 * the statement, an amount that is not strictly positive, an unusable date: all
 * three would produce a plausible figure, so all three stop here.
 *
 * A NEGATIVE result is not one of those cases: an overdraft is a fact, and
 * refusing to show it would be the one thing worse than showing it.
 */
export function deriveAccountBalance(input: DeriveAccountBalanceInput): DerivedAccountBalance {
  const { statement, flows, asOf } = input;

  assertRealDate(statement.statedOn, 'statement.statedOn');
  assertRealDate(statement.recordedAt, 'statement.recordedAt');
  assertRealDate(asOf, 'asOf');

  if (asOf.getTime() < statement.statedOn.getTime()) {
    throw new RangeError(
      'asOf must not be earlier than the statement it derives from — there is nothing to unwind',
    );
  }

  const withinAsOf = (flow: AccountFlow) => flow.occurredOn.getTime() <= asOf.getTime();
  const contributions = collectContributions(statement, flows, withinAsOf);
  const netFlow = sumContributions(contributions);

  return {
    accountType: statement.accountType,
    anchor: statement,
    balance: statement.balance.plus(netFlow),
    netFlow,
    contributions,
  };
}

/**
 * What a statement does NOT explain (ADR-045 D14, ADR-040 D11).
 *
 * A series of statements is dangerous on its own, and ADR-038 D6 said so: each
 * new statement ABSORBS the gap between what the journal derives and what the
 * bank says. The balance becomes right again, and what was missing disappears.
 *
 * This function is the counterpart that makes the series safe — it turns that
 * gap into a number instead of letting it be swallowed. `gap` is
 * `derived − declared`:
 *
 *   - positive → the journal believes more than the bank: spending was never
 *     written down;
 *   - negative → money arrived without being written down.
 *
 * Neither is an error, and neither is corrected here. Measuring IS the job; a
 * reconciliation that also repaired things would erase its own evidence.
 *
 * The window is open at `anchor` and closed at `statement`, both ends under the
 * same hour rule.
 */
export function measureStatementGap(input: StatementGapInput): StatementGap {
  const { statement, anchor, flows } = input;

  assertRealDate(statement.statedOn, 'statement.statedOn');
  assertRealDate(statement.recordedAt, 'statement.recordedAt');
  assertRealDate(anchor.statedOn, 'anchor.statedOn');
  assertRealDate(anchor.recordedAt, 'anchor.recordedAt');

  if (anchor.accountType !== statement.accountType) {
    throw new RangeError('anchor must belong to the same account as the statement it measures');
  }

  // Equality is refused too: a statement cannot measure itself, and two rows
  // equal on the three ordering columns ARE the same row.
  if (compareStatementOrder(anchor, statement) >= 0) {
    throw new RangeError(
      'anchor must be strictly earlier than the statement it measures, in the (stated_on, recorded_at, id) order',
    );
  }

  const upToStatement = (flow: AccountFlow) => !flowCountsAfterStatement(statement, flow);
  const contributions = collectContributions(anchor, flows, upToStatement);
  const netFlow = sumContributions(contributions);
  const derived = anchor.balance.plus(netFlow);

  return {
    accountType: statement.accountType,
    statement,
    anchor,
    declared: statement.balance,
    derived,
    gap: derived.minus(statement.balance),
    netFlow,
    contributions,
  };
}
