import { describe, expect, it } from 'vitest';

import { money } from '@/lib/domain/types';
import { deriveAccountBalance, type AccountBalanceStatement } from '../solde';
import {
  accountBalanceView,
  movementToFlows,
  sameDayFlowsAfter,
  sameDayStatement,
  type MovementRecord,
} from '../operations-view';

/*
 * ADR-045 D21 — an income written on the day of a statement, AFTER it. The
 * hour rule (D16) counts it against the statement; when the balance read
 * already held that money, the balance is counted twice. The person says so,
 * and the statement is written again, after the operation.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const at = (iso: string) => new Date(iso);

function statement(
  id: string,
  balance: number,
  statedOn: string,
  opts: { recordedAt?: string; cancelled?: boolean } = {},
): AccountBalanceStatement {
  return {
    id,
    accountType: 'income_bills',
    balance: money(balance),
    statedOn: d(statedOn),
    recordedAt: at(opts.recordedAt ?? `${statedOn}T08:00:00Z`),
    cancelledAt: opts.cancelled ? at('2026-09-28T12:00:00Z') : null,
  };
}

function income(
  id: string,
  amount: number,
  occurredOn: string,
  recordedAt: string,
): MovementRecord {
  return {
    id,
    kind: 'income',
    fromAccountType: null,
    toAccountType: 'income_bills',
    amount: money(amount),
    occurredOn: d(occurredOn),
    recordedAt: at(recordedAt),
    cancelledAt: null,
    planYear: null,
    planMonth: null,
    planSuggestedAmount: null,
    provisionPart: null,
    freeSavingsPart: null,
    incomeNature: 'regular',
    budgetYear: 2026,
    budgetMonth: 10,
    description: null,
  };
}

// Before the salary: 200 €. The salary (705 €) lands on the 28th; the balance
// is read AFTER it (905 €), then the income is written, later the same day.
const previous = statement('s-prev', 200, '2026-09-20');
const readAfterSalary = statement('s-28', 905, '2026-09-28', {
  recordedAt: '2026-09-28T09:00:00Z',
});
const salary = income('m-salary', 705, '2026-09-28', '2026-09-28T09:05:00Z');
// D21: the same statement, written again after the income.
const rewritten = statement('s-28-bis', 905, '2026-09-28', {
  recordedAt: '2026-09-28T09:06:00Z',
});
const cancelledOriginal = statement('s-28', 905, '2026-09-28', {
  recordedAt: '2026-09-28T09:00:00Z',
  cancelled: true,
});
const today = d('2026-09-28');

describe('« Non, pas encore » — the hour rule as it stands (D16)', () => {
  it('counts the income written after the same-day statement', () => {
    const view = accountBalanceView({
      accountType: 'income_bills',
      statements: [previous, readAfterSalary],
      movements: [salary],
      today,
    });
    expect(view?.computed?.balance.toFixed(2)).toBe('1610.00');
    // Measured against the statement before it, the salary is left out of the
    // window: the read balance looks 705 € richer than the journal.
    expect(view?.gap?.gap.toFixed(2)).toBe('-705.00');
  });

  it('names the same-day operations counted after the statement, and their total', () => {
    const view = accountBalanceView({
      accountType: 'income_bills',
      statements: [previous, readAfterSalary],
      movements: [salary],
      today,
    });
    expect(view?.sameDayAfter?.total.toFixed(2)).toBe('705.00');
    expect(view?.sameDayAfter?.flows.map((f) => f.id)).toEqual(['m-salary:in']);
  });
});

describe('« Oui, déjà dedans » — the statement written again after the operation (D21)', () => {
  const statements = [previous, cancelledOriginal, rewritten];

  it('the income of the day no longer counts against the statement', () => {
    const view = accountBalanceView({
      accountType: 'income_bills',
      statements,
      movements: [salary],
      today,
    });
    expect(view?.read.id).toBe('s-28-bis');
    expect(view?.read.balance.toFixed(2)).toBe('905.00');
    expect(view?.computed).toBeNull();
    expect(view?.sameDayAfter).toBeNull();
  });

  it('the gap is measured against the statement before it, and the income closes it', () => {
    const view = accountBalanceView({
      accountType: 'income_bills',
      statements,
      movements: [salary],
      today,
    });
    // 200 + 705 = 905 : nothing unexplained.
    expect(view?.gap).toBeNull();
    const derived = deriveAccountBalance({
      statement: previous,
      flows: movementToFlows(salary),
      asOf: today,
    });
    expect(derived.balance.toFixed(2)).toBe('905.00');
  });
});

describe('sameDayFlowsAfter', () => {
  it('ignores an operation of a LATER day — that one is right to count', () => {
    const later = income('m-later', 505, '2026-09-29', '2026-09-29T08:00:00Z');
    expect(sameDayFlowsAfter(readAfterSalary, movementToFlows(later))).toEqual([]);
    const view = accountBalanceView({
      accountType: 'income_bills',
      statements: [previous, readAfterSalary],
      movements: [later],
      today: d('2026-09-29'),
    });
    expect(view?.computed?.balance.toFixed(2)).toBe('1410.00');
    expect(view?.sameDayAfter).toBeNull();
  });

  it('ignores a same-day operation written BEFORE the statement, and a cancelled one', () => {
    const before = income('m-before', 705, '2026-09-28', '2026-09-28T07:00:00Z');
    const cancelled = { ...salary, id: 'm-cancelled', cancelledAt: at('2026-09-28T10:00:00Z') };
    const flows = [...movementToFlows(before), ...movementToFlows(cancelled)];
    expect(sameDayFlowsAfter(readAfterSalary, flows)).toEqual([]);
  });

  it('counts an outgoing transfer of the day too, with its sign', () => {
    const out: MovementRecord = {
      ...salary,
      id: 'm-out',
      kind: 'transfer',
      fromAccountType: 'income_bills',
      toAccountType: 'daily_card',
      amount: money(505),
      incomeNature: null,
      budgetYear: null,
      budgetMonth: null,
      planYear: 2026,
      planMonth: 10,
      planSuggestedAmount: money(505),
    };
    const view = accountBalanceView({
      accountType: 'income_bills',
      statements: [previous, readAfterSalary],
      movements: [out],
      today,
    });
    expect(view?.sameDayAfter?.total.toFixed(2)).toBe('-505.00');
  });
});

describe('sameDayStatement — when the question applies', () => {
  it('is the latest standing statement when it was read on that day', () => {
    expect(sameDayStatement([previous, readAfterSalary], 'income_bills', today)?.id).toBe('s-28');
  });

  it('is null on another day, on another account, or when that statement is cancelled', () => {
    expect(
      sameDayStatement([previous, readAfterSalary], 'income_bills', d('2026-09-27')),
    ).toBeNull();
    expect(sameDayStatement([previous, readAfterSalary], 'daily_card', today)).toBeNull();
    expect(sameDayStatement([previous, cancelledOriginal], 'income_bills', today)).toBeNull();
  });

  it('is null when the statement of the day is the starting balance: it is never rewritten', () => {
    const start = statement('s-start', 905, '2026-09-28');
    expect(sameDayStatement([start], 'income_bills', today)).toBeNull();
    const view = accountBalanceView({
      accountType: 'income_bills',
      statements: [start],
      movements: [income('m-1', 705, '2026-09-28', '2026-09-28T09:00:00Z')],
      today,
    });
    expect(view?.sameDayAfter).toBeNull();
  });
});
