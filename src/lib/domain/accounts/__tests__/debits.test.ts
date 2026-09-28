import { describe, expect, it } from 'vitest';

import { money } from '@/lib/domain/types';
import type { AccountBalanceStatement, AccountFlow, StatementGap } from '../solde';
import { billPaymentToFlow, brusselsDay, expenseToFlow } from '../debits';
import {
  accountBalanceView,
  expectedBalanceOn,
  expectedLines,
  sameDayFlowsAfter,
  type MovementRecord,
} from '../operations-view';

/**
 * ADR-045 D22 — expenses and paid bills are flows of the derived balance.
 * Fictional amounts only (public repository).
 */

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const at = (iso: string) => new Date(iso);

type Account = AccountBalanceStatement['accountType'];

function statement(
  id: string,
  balance: number,
  statedOn: string,
  opts: { recordedAt?: string; accountType?: Account } = {},
): AccountBalanceStatement {
  return {
    id,
    accountType: opts.accountType ?? 'daily_card',
    balance: money(balance),
    statedOn: d(statedOn),
    recordedAt: at(opts.recordedAt ?? `${statedOn}T08:00:00Z`),
    cancelledAt: null,
  };
}

function income(id: string, amount: number, occurredOn: string, to: Account): MovementRecord {
  return {
    id,
    kind: 'income',
    fromAccountType: null,
    toAccountType: to,
    amount: money(amount),
    occurredOn: d(occurredOn),
    recordedAt: at(`${occurredOn}T12:00:00Z`),
    cancelledAt: null,
    planYear: null,
    planMonth: null,
    planSuggestedAmount: null,
    provisionPart: null,
    freeSavingsPart: null,
    incomeNature: 'regular',
    budgetYear: null,
    budgetMonth: null,
    description: null,
  };
}

function transfer(
  id: string,
  amount: number,
  from: Account,
  to: Account,
  occurredOn: string,
): MovementRecord {
  return {
    ...income(id, amount, occurredOn, to),
    kind: 'transfer',
    fromAccountType: from,
    incomeNature: null,
  };
}

function expense(
  id: string,
  amount: number,
  occurredOn: string,
  opts: { recordedAt?: string; paidFrom?: 'principal' | 'vie_courante' | 'epargne' } = {},
): AccountFlow {
  const flow = expenseToFlow({
    id,
    amount: money(amount),
    occurredOn,
    createdAt: at(opts.recordedAt ?? `${occurredOn}T18:00:00Z`),
    paidFrom: opts.paidFrom ?? 'vie_courante',
  });
  if (!flow) throw new Error('expected a flow');
  return flow;
}

function bill(
  id: string,
  amount: number,
  paidAt: string,
  source: 'charge' | 'commitment' = 'charge',
): AccountFlow {
  const flow = billPaymentToFlow({
    id,
    source,
    amount: money(amount),
    paidAt: at(paidAt),
    createdAt: at(paidAt),
  });
  if (!flow) throw new Error('expected a flow');
  return flow;
}

const view = (
  statements: AccountBalanceStatement[],
  movements: MovementRecord[],
  debits: AccountFlow[],
  accountType: Account = 'daily_card',
) => accountBalanceView({ accountType, statements, movements, debits, today: d('2026-09-30') });

describe('expenseToFlow / billPaymentToFlow', () => {
  it('turns an expense into an outflow of the account it was paid from', () => {
    const f = expense('e1', 45.5, '2026-09-12');
    expect([f.accountType, f.direction, f.amount.toNumber(), f.origin]).toEqual([
      'daily_card',
      'out',
      45.5,
      'expense',
    ]);
    expect(f.occurredOn).toEqual(d('2026-09-12'));
    expect(f.recordedAt).toEqual(at('2026-09-12T18:00:00Z'));
    expect(f.cancelledAt).toBeNull();
    expect(expense('e2', 10, '2026-09-12', { paidFrom: 'principal' }).accountType).toBe(
      'income_bills',
    );
  });

  it('drops a zero amount — nothing left the account', () => {
    expect(
      expenseToFlow({
        id: 'z',
        amount: money(0),
        occurredOn: '2026-09-12',
        createdAt: at('2026-09-12T10:00:00Z'),
        paidFrom: 'principal',
      }),
    ).toBeNull();
    expect(
      billPaymentToFlow({
        id: 'z',
        source: 'charge',
        amount: money(0),
        paidAt: at('2026-09-12T10:00:00Z'),
        createdAt: at('2026-09-12T10:00:00Z'),
      }),
    ).toBeNull();
  });

  it('a paid bill or instalment always leaves the bills account (the payer is not recorded)', () => {
    expect(bill('p1', 70.5, '2026-09-14T09:00:00Z').accountType).toBe('income_bills');
    expect(bill('p2', 70.5, '2026-09-14T09:00:00Z', 'commitment').accountType).toBe('income_bills');
  });

  it('dates a paid bill on the Brussels day of paid_at, written at created_at', () => {
    // 23:30 UTC on the 14th is already the 15th in Brussels (summer time).
    const f = billPaymentToFlow({
      id: 'p1',
      source: 'commitment',
      amount: money(70.5),
      paidAt: at('2026-09-14T23:30:00Z'),
      createdAt: at('2026-09-14T23:30:01Z'),
    });
    expect(f?.occurredOn).toEqual(d('2026-09-15'));
    expect(f?.recordedAt).toEqual(at('2026-09-14T23:30:01Z'));
    expect([f?.direction, f?.origin]).toEqual(['out', 'bill']);
    expect(brusselsDay(at('2026-01-10T23:30:00Z'))).toEqual(d('2026-01-11'));
    expect(brusselsDay(at('2026-01-10T22:30:00Z'))).toEqual(d('2026-01-10'));
  });

  it('gives each source its own id space, so a movement id never matches an expense', () => {
    expect(expense('abc', 1, '2026-09-12').id).toBe('expense:abc');
    expect(bill('abc', 1, '2026-09-12T10:00:00Z').id).toBe('charge_payment:abc');
    expect(bill('abc', 1, '2026-09-12T10:00:00Z', 'commitment').id).toBe('commitment_payment:abc');
  });
});

describe('accountBalanceView with debits (D22)', () => {
  const start = statement('s0', 705, '2026-09-10');

  it('an expense lowers the derived balance of its own account only', () => {
    const e = expense('e1', 50, '2026-09-12');
    expect(view([start], [], [e])?.computed?.balance.toNumber()).toBe(655);
    const other = statement('b0', 505, '2026-09-10', { accountType: 'income_bills' });
    // Not the income_bills account: the expense left the daily card.
    expect(view([start, other], [], [e], 'income_bills')?.computed).toBeNull();
  });

  it('same day as a statement: written before it does not count, after it counts', () => {
    const s = statement('s1', 600, '2026-09-20', { recordedAt: '2026-09-20T12:00:00Z' });
    const before = expense('before', 10, '2026-09-20', { recordedAt: '2026-09-20T11:00:00Z' });
    const after = expense('after', 25, '2026-09-20', { recordedAt: '2026-09-20T13:00:00Z' });
    const v = view([start, s], [], [before, after]);
    expect(v?.computed?.balance.toNumber()).toBe(575);
    // The card offers « mon solde les contenait déjà » for the one after.
    expect(v?.sameDayAfter?.total.toNumber()).toBe(-25);
    expect(v?.sameDayAfter?.flows.map((f) => f.id)).toEqual(['expense:after']);
    expect(sameDayFlowsAfter(s, [before, after]).map((f) => f.id)).toEqual(['expense:after']);
  });

  it('a deleted expense is absent, so it counts for nothing', () => {
    expect(view([start], [], [])?.computed).toBeNull();
  });

  it('a paid bill debits the bills account', () => {
    const bills = statement('b0', 505, '2026-09-10', { accountType: 'income_bills' });
    const paid = bill('p1', 120, '2026-09-15T09:00:00Z');
    expect(view([bills], [], [paid], 'income_bills')?.computed?.balance.toNumber()).toBe(385);
    expect(view([start], [], [paid])?.computed).toBeNull();
  });

  it('expectedBalanceOn counts the debits too — the stored figure equals the card', () => {
    const e = expense('e1', 50, '2026-09-12');
    expect(
      expectedBalanceOn({
        accountType: 'daily_card',
        statements: [start],
        movements: [],
        debits: [e],
        statedOn: d('2026-09-20'),
      })?.toNumber(),
    ).toBe(655);
  });
});

describe('the expected balance opens on its lines, and the gap is read − expected', () => {
  const opts = { accountType: 'income_bills' as const };
  const start = statement('s0', 705, '2026-09-10', opts);
  const movements = [
    income('i1', 505, '2026-09-11', 'income_bills'),
    transfer('t-in', 100, 'provisions', 'income_bills', '2026-09-12'),
    transfer('t-out', 30, 'income_bills', 'daily_card', '2026-09-13'),
  ];
  const debits = [
    bill('p1', 40, '2026-09-14T09:00:00Z'),
    expense('e1', 55.25, '2026-09-15', { paidFrom: 'principal' }),
  ];

  it('lists anchor, received, transfers, bills and expenses, summing to the expected', () => {
    const later = statement('s1', 1100, '2026-09-20', opts);
    const g = view([start, later], movements, debits, 'income_bills')?.gap;
    expect(g).not.toBeNull();
    const l = g!.lines;
    expect(l.from.statedOn).toEqual(d('2026-09-10'));
    expect(l.from.isStart).toBe(true);
    expect(l.from.balance.toNumber()).toBe(705);
    expect(l.received.toNumber()).toBe(505);
    expect(l.transfersIn.toNumber()).toBe(100);
    expect(l.transfersOut.toNumber()).toBe(30);
    expect(l.bills.toNumber()).toBe(40);
    expect(l.expenses.toNumber()).toBe(55.25);
    const sum = l.from.balance
      .plus(l.received)
      .plus(l.transfersIn)
      .minus(l.transfersOut)
      .minus(l.bills)
      .minus(l.expenses);
    expect(sum.toNumber()).toBe(1184.75);
    expect(l.expected.toNumber()).toBe(1184.75);
    expect(g!.derived.toNumber()).toBe(1184.75);
  });

  it('less money than expected reads negative', () => {
    const later = statement('s1', 1100, '2026-09-20', opts);
    expect(
      view([start, later], movements, debits, 'income_bills')?.gap?.difference.toNumber(),
    ).toBe(-84.75);
  });

  it('more money than expected reads positive', () => {
    const later = statement('s1', 1200, '2026-09-20', opts);
    expect(
      view([start, later], movements, debits, 'income_bills')?.gap?.difference.toNumber(),
    ).toBe(15.25);
  });

  it('refuses lines it cannot name, and lines that would not add up', () => {
    const later = statement('s1', 1100, '2026-09-20', opts);
    const g = view([start, later], movements, debits, 'income_bills')!.gap!;
    const unnamed: StatementGap = {
      ...g,
      contributions: [
        ...g.contributions,
        {
          flow: { ...g.contributions[0]!.flow, origin: undefined },
          signedAmount: money(1),
        },
      ],
    };
    expect(() => expectedLines(unnamed, 's0')).toThrow(/has no line/);
    const offBy: StatementGap = { ...g, derived: g.derived.plus(1) };
    expect(() => expectedLines(offBy, 's0')).toThrow(/do not add up/);
  });
});
