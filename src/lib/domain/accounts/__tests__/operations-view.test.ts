import { describe, expect, it } from 'vitest';

import { money } from '@/lib/domain/types';
import type { AccountBalanceStatement } from '../solde';
import {
  accountBalanceView,
  expectedBalanceOn,
  movementToFlows,
  plannedTransferLine,
  splitTransferToProvisions,
  type MovementRecord,
} from '../operations-view';

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
    accountType: 'daily_card',
    balance: money(balance),
    statedOn: d(statedOn),
    recordedAt: at(opts.recordedAt ?? `${statedOn}T08:00:00Z`),
    cancelledAt: opts.cancelled ? at('2026-09-21T10:00:00Z') : null,
  };
}

function transfer(id: string, amount: number, over: Partial<MovementRecord> = {}): MovementRecord {
  return {
    id,
    kind: 'transfer',
    fromAccountType: 'income_bills',
    toAccountType: 'daily_card',
    amount: money(amount),
    occurredOn: d('2026-09-10'),
    recordedAt: at('2026-09-10T12:00:00Z'),
    cancelledAt: null,
    planYear: 2026,
    planMonth: 9,
    planSuggestedAmount: money(505),
    provisionPart: null,
    freeSavingsPart: null,
    incomeNature: null,
    description: null,
    ...over,
  };
}

describe('movementToFlows', () => {
  it('turns a transfer into one outflow and one inflow of the same amount', () => {
    const flows = movementToFlows(transfer('m', 505));
    expect(flows.map((f) => [f.accountType, f.direction, f.amount.toNumber()])).toEqual([
      ['income_bills', 'out', 505],
      ['daily_card', 'in', 505],
    ]);
  });
});

describe('splitTransferToProvisions', () => {
  it('fills the provisions first, capped at the amount', () => {
    const big = splitTransferToProvisions(money(360), money(59));
    expect([big.provisionPart.toNumber(), big.freeSavingsPart.toNumber()]).toEqual([59, 301]);
    const small = splitTransferToProvisions(money(40), money(59));
    expect([small.provisionPart.toNumber(), small.freeSavingsPart.toNumber()]).toEqual([40, 0]);
  });
});

describe('accountBalanceView', () => {
  it('names the first statement the starting balance, and a later one not', () => {
    const start = statement('a', 505, '2026-09-01');
    const first = accountBalanceView({
      accountType: 'daily_card',
      statements: [start],
      movements: [],
      today: d('2026-09-21'),
    });
    expect(first!.readIsStartingBalance).toBe(true);
    expect(first!.read.statedOn).toEqual(d('2026-09-01'));

    const later = accountBalanceView({
      accountType: 'daily_card',
      statements: [start, statement('b', 480, '2026-09-15')],
      movements: [],
      today: d('2026-09-21'),
    });
    expect(later!.readIsStartingBalance).toBe(false);
    expect(later!.read.id).toBe('b');
  });

  it('computes read + operations since, and no computed figure without an operation', () => {
    const none = accountBalanceView({
      accountType: 'daily_card',
      statements: [statement('a', 100, '2026-09-01')],
      movements: [],
      today: d('2026-09-21'),
    });
    expect(none!.computed).toBeNull();

    const some = accountBalanceView({
      accountType: 'daily_card',
      statements: [statement('a', -20, '2026-09-01')],
      movements: [transfer('m', 505), transfer('x', 50, { cancelledAt: at('2026-09-11') })],
      today: d('2026-09-21'),
    });
    expect(some!.computed!.balance.toNumber()).toBe(485);
    expect(some!.computed!.contributions).toHaveLength(1);
  });

  it('measures the gap of the latest statement against the previous one', () => {
    const view = accountBalanceView({
      accountType: 'daily_card',
      statements: [statement('a', 100, '2026-09-01'), statement('b', 550, '2026-09-15')],
      movements: [transfer('m', 505)],
      today: d('2026-09-21'),
    });
    // expected 100 + 505 = 605, read 550 → 55 of spending Ankora does not follow yet
    expect(view!.gap!.gap.toNumber()).toBe(55);
  });

  it('keeps an older cancelled statement reopenable once a newer one is reopened', () => {
    const view = accountBalanceView({
      accountType: 'daily_card',
      statements: [
        statement('a', 100, '2026-09-01'),
        statement('b', 90, '2026-09-10', { cancelled: true }),
        statement('c', 80, '2026-09-15'),
      ],
      movements: [],
      today: d('2026-09-21'),
    });
    expect(view!.read.id).toBe('c');
    expect(view!.reopenable!.id).toBe('b');
  });

  it('offers the latest cancelled statement newer than the one standing, for reopening', () => {
    const view = accountBalanceView({
      accountType: 'daily_card',
      statements: [
        statement('a', 100, '2026-09-01'),
        statement('b', 90, '2026-09-15', { cancelled: true }),
      ],
      movements: [],
      today: d('2026-09-21'),
    });
    expect(view!.read.id).toBe('a');
    expect(view!.readIsStartingBalance).toBe(true);
    expect(view!.reopenable!.id).toBe('b');
  });
});

describe('expectedBalanceOn', () => {
  it('derives from the latest statement on or before the day', () => {
    const expected = expectedBalanceOn({
      accountType: 'daily_card',
      statements: [statement('a', 100, '2026-09-01'), statement('z', 999, '2026-09-30')],
      movements: [transfer('m', 505)],
      statedOn: d('2026-09-21'),
    });
    // The statement of the 30th is AFTER the day asked: it must not anchor.
    expect(expected!.toNumber()).toBe(605);
    expect(
      expectedBalanceOn({
        accountType: 'daily_card',
        statements: [],
        movements: [],
        statedOn: d('2026-09-21'),
      }),
    ).toBeNull();
  });
});

describe('plannedTransferLine', () => {
  const key = {
    fromAccountType: 'income_bills',
    toAccountType: 'daily_card',
    planYear: 2026,
    planMonth: 9,
  } as const;

  it('is done while a non-cancelled transfer of that plan month exists', () => {
    const line = plannedTransferLine({ ...key, movements: [transfer('m', 480)] });
    expect(line).toMatchObject({ state: 'done' });
  });

  it('is to do again once cancelled, and keeps the cancelled one for reopening', () => {
    const line = plannedTransferLine({
      ...key,
      movements: [transfer('m', 480, { cancelledAt: at('2026-09-11') })],
    });
    expect(line).toEqual({ state: 'todo', cancelled: expect.objectContaining({ id: 'm' }) });
  });

  it('ignores another month and another pair of accounts', () => {
    const line = plannedTransferLine({
      ...key,
      movements: [
        transfer('m', 1, { planMonth: 8 }),
        transfer('n', 1, { toAccountType: 'provisions' }),
      ],
    });
    expect(line).toEqual({ state: 'todo', cancelled: null });
  });
});
