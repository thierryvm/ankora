import { describe, expect, it } from 'vitest';

import { money } from '@/lib/domain/types';
import { accountBalanceView, sameDayStatementIds, withIncludedFlows } from '../operations-view';
import type { AccountBalanceStatement, AccountFlow } from '../solde';

/*
 * Tour 58 ter, point 9 — ADR-045 D23, decided by @thierry: a « Déjà dedans »
 * answer holds for every standing statement of the same account, the same day
 * and the same balance (the bank had debited the operation before each of
 * those readings). The row stays attached to its own statement; the READING
 * lends it. Fictitious figures (505 / 705).
 */

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const at = (iso: string) => new Date(iso);

function statement(
  id: string,
  balance: number,
  statedOn: string,
  recordedAt: string,
  patch: Partial<AccountBalanceStatement> = {},
): AccountBalanceStatement {
  return {
    id,
    accountType: 'daily_card',
    balance: money(balance),
    statedOn: d(statedOn),
    recordedAt: at(recordedAt),
    cancelledAt: null,
    ...patch,
  };
}

function out(id: string, amount: number, recordedAt: string): AccountFlow {
  return {
    id,
    accountType: 'daily_card',
    direction: 'out',
    amount: money(amount),
    occurredOn: d('2026-09-28'),
    recordedAt: at(recordedAt),
    cancelledAt: null,
    origin: 'bill',
  };
}

const start = statement('s0', 705, '2026-09-01', '2026-09-01T08:00:00Z');
const first = statement('s1', 505, '2026-09-28', '2026-09-28T09:00:00Z');
const second = statement('s2', 505, '2026-09-28', '2026-09-28T09:30:00Z');

function view(statements: AccountBalanceStatement[], debits: AccountFlow[]) {
  return accountBalanceView({
    accountType: 'daily_card',
    statements,
    movements: [],
    debits,
    today: d('2026-09-28'),
  });
}

const ids = (list: AccountBalanceStatement[], id: string) =>
  list.find((s) => s.id === id)?.includedFlowIds;

describe('a « Déjà dedans » answer holds for every reading of the day at the same balance', () => {
  it('two readings the same day at the same balance, the operation answered on the latest → gap 0, computed balance right', () => {
    const bill = out('charge_payment:b1', 200, '2026-09-28T10:00:00Z');
    const statements = withIncludedFlows(
      [start, first, second],
      [{ statement_id: 's2', flow_id: bill.id }],
      [bill],
    );
    const v = view(statements, [bill]);
    expect(v?.gap).toBeNull();
    expect(v?.computed).toBeNull();
    expect(v?.read.balance.toNumber()).toBe(505);
  });

  it('the operation between the two readings, answered when the first was the latest → gap 0', () => {
    const later = statement('s2', 505, '2026-09-28', '2026-09-28T11:00:00Z');
    const bill = out('charge_payment:b1', 200, '2026-09-28T10:00:00Z');
    const statements = withIncludedFlows(
      [start, first, later],
      [{ statement_id: 's1', flow_id: bill.id }],
      [bill],
    );
    const v = view(statements, [bill]);
    expect(v?.gap).toBeNull();
    expect(v?.computed).toBeNull();
  });

  it('an answer never changes how ANOTHER operation counts (invariant of #513)', () => {
    const later = statement('s2', 505, '2026-09-28', '2026-09-28T11:00:00Z');
    const spend = out('expense:e1', 200, '2026-09-28T10:30:00Z');
    const bill = out('charge_payment:b1', 200, '2026-09-28T11:30:00Z');
    const statements = withIncludedFlows(
      [start, first, later],
      [{ statement_id: 's2', flow_id: bill.id }],
      [spend, bill],
    );
    const v = view(statements, [spend, bill]);
    // The unanswered spend still counts between the two readings: +200 read over expected.
    expect(v?.gap?.difference.toNumber()).toBe(200);
  });

  it('two readings of the day that DIFFER: the answer stays on its own (no gap the user cannot explain)', () => {
    // 705 read at 09:00, the bank debits 200, 505 read at 11:00, the bill is
    // written at 12:00 and answered inside the 11:00 reading.
    const before = statement('s1', 705, '2026-09-28', '2026-09-28T09:00:00Z');
    const after = statement('s2', 505, '2026-09-28', '2026-09-28T11:00:00Z');
    const bill = out('charge_payment:b1', 200, '2026-09-28T12:00:00Z');
    const statements = withIncludedFlows(
      [start, before, after],
      [{ statement_id: 's2', flow_id: bill.id }],
      [bill],
    );
    expect(ids(statements, 's1')).toEqual([]);
    const v = view(statements, [bill]);
    expect(v?.gap).toBeNull();
    expect(v?.computed).toBeNull();
  });

  it('a row inert where it stands (operation written BEFORE its reading) is lent to nobody', () => {
    const later = statement('s2', 505, '2026-09-28', '2026-09-28T11:00:00Z');
    const bill = out('charge_payment:b1', 200, '2026-09-28T10:00:00Z');
    const statements = withIncludedFlows(
      [start, first, later],
      [{ statement_id: 's2', flow_id: bill.id }],
      [bill],
    );
    expect(ids(statements, 's1')).toEqual([]);
  });

  it('never reaches the starting balance of the account, even the same day at the same balance', () => {
    const startSameDay = statement('s0', 505, '2026-09-28', '2026-09-28T07:00:00Z');
    const bill = out('charge_payment:b1', 200, '2026-09-28T10:00:00Z');
    const statements = withIncludedFlows(
      [startSameDay, first, second],
      [{ statement_id: 's2', flow_id: bill.id }],
      [bill],
    );
    expect(ids(statements, 's0')).toEqual([]);
    expect(ids(statements, 's1')).toEqual([bill.id]);
  });

  it('never reaches another day, another account, or a cancelled reading; a cancelled one lends nothing', () => {
    const bill = out('charge_payment:b1', 200, '2026-09-28T10:00:00Z');
    const spend = out('expense:e9', 200, '2026-09-28T10:00:00Z');
    const otherDay = statement('s3', 505, '2026-09-27', '2026-09-27T09:00:00Z');
    const provStart = statement('s6', 505, '2026-09-28', '2026-09-28T07:00:00Z', {
      accountType: 'provisions',
    });
    const otherAccount = statement('s4', 505, '2026-09-28', '2026-09-28T09:15:00Z', {
      accountType: 'provisions',
    });
    const cancelled = statement('s5', 505, '2026-09-28', '2026-09-28T09:45:00Z', {
      cancelledAt: at('2026-09-28T09:50:00Z'),
    });
    const statements = withIncludedFlows(
      [start, otherDay, first, second, provStart, otherAccount, cancelled],
      [
        { statement_id: 's2', flow_id: bill.id },
        { statement_id: 's5', flow_id: spend.id },
      ],
      [bill, spend],
    );
    expect(ids(statements, 's1')).toEqual([bill.id]);
    expect(ids(statements, 's2')).toEqual([bill.id]);
    expect(ids(statements, 's3')).toEqual([]);
    expect(ids(statements, 's4')).toEqual([]);
    expect(ids(statements, 's5')).toEqual([spend.id]);
  });

  it('sameDayStatementIds: the readings of the account that day, starting balance excluded, cancelled on request', () => {
    const cancelled = statement('s5', 505, '2026-09-28', '2026-09-28T09:15:00Z', {
      cancelledAt: at('2026-09-28T09:20:00Z'),
    });
    const all = [start, first, cancelled, second];
    expect(sameDayStatementIds(all, 'daily_card', d('2026-09-28'))).toEqual(['s1', 's2']);
    expect(
      sameDayStatementIds(all, 'daily_card', d('2026-09-28'), { includeCancelled: true }),
    ).toEqual(['s1', 's5', 's2']);
    expect(sameDayStatementIds([start], 'daily_card', d('2026-09-01'))).toEqual([]);
  });
});
