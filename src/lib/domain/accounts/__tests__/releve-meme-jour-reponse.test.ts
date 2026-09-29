import { describe, expect, it } from 'vitest';

import { money } from '@/lib/domain/types';
import { accountBalanceView, sameDayStatementIds, withIncludedFlows } from '../operations-view';
import type { AccountBalanceStatement, AccountFlow } from '../solde';

/*
 * Tour 58 ter, point 9 — ADR-045 D23, decided by @thierry: a « Déjà dedans »
 * answer holds for EVERY standing statement of the same account and the same
 * day. The bank had debited the operation before each of those readings. The
 * row stays attached to its own statement; the READING applies it to the day.
 * Fictitious figures (505 / 705).
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
const second = statement('s2', 505, '2026-09-28', '2026-09-28T11:00:00Z');

function view(statements: AccountBalanceStatement[], debits: AccountFlow[]) {
  return accountBalanceView({
    accountType: 'daily_card',
    statements,
    movements: [],
    debits,
    today: d('2026-09-28'),
  });
}

describe('a « Déjà dedans » answer holds for every statement of the account that day', () => {
  it('two statements the same day at the same balance, the operation between them answered inside → gap 0, computed balance right', () => {
    const bill = out('charge_payment:b1', 200, '2026-09-28T10:00:00Z');
    const statements = withIncludedFlows(
      [start, first, second],
      [{ statement_id: 's2', flow_id: bill.id }],
    );
    const v = view(statements, [bill]);
    expect(v?.gap).toBeNull();
    // Nothing written after the latest reading: the computed balance IS the reading.
    expect(v?.computed).toBeNull();
    expect(v?.read.balance.toNumber()).toBe(505);
  });

  it('the answer given on the earlier statement holds for the later one too', () => {
    const later = out('charge_payment:b2', 200, '2026-09-28T12:00:00Z');
    const statements = withIncludedFlows(
      [start, first, second],
      [{ statement_id: 's1', flow_id: later.id }],
    );
    const v = view(statements, [later]);
    expect(v?.computed).toBeNull();
    expect(statements.find((s) => s.id === 's2')?.includedFlowIds).toEqual([later.id]);
  });

  it('an answer never changes how ANOTHER operation counts (invariant of #513)', () => {
    const bill = out('charge_payment:b1', 200, '2026-09-28T10:00:00Z');
    const spend = out('expense:e1', 200, '2026-09-28T10:30:00Z');
    const statements = withIncludedFlows(
      [start, first, second],
      [{ statement_id: 's2', flow_id: bill.id }],
    );
    const v = view(statements, [bill, spend]);
    // The unanswered spend still counts between the two readings: +200 read over expected.
    expect(v?.gap?.difference.toNumber()).toBe(200);
  });

  it('never reaches another day, another account, the starting balance, or a cancelled statement', () => {
    const otherDay = statement('s3', 505, '2026-09-27', '2026-09-27T09:00:00Z');
    const otherAccount = statement('s4', 505, '2026-09-28', '2026-09-28T09:30:00Z', {
      // Not the starting balance of its account (s6 is): only the account differs.
      accountType: 'provisions',
    });
    const cancelled = statement('s5', 505, '2026-09-28', '2026-09-28T10:45:00Z', {
      cancelledAt: at('2026-09-28T10:50:00Z'),
    });
    const startSameDay = statement('s6', 705, '2026-09-28', '2026-09-28T07:00:00Z', {
      accountType: 'provisions',
    });
    const out1 = withIncludedFlows(
      [start, otherDay, first, second, otherAccount, cancelled, startSameDay],
      [
        { statement_id: 's2', flow_id: 'charge_payment:b1' },
        { statement_id: 's5', flow_id: 'expense:e9' },
      ],
    );
    const ids = (id: string) => out1.find((s) => s.id === id)?.includedFlowIds;
    expect(ids('s1')).toEqual(['charge_payment:b1']);
    expect(ids('s2')).toEqual(['charge_payment:b1']);
    expect(ids('s3')).toEqual([]);
    expect(ids('s4')).toEqual([]);
    expect(ids('s0')).toEqual([]);
    expect(ids('s6')).toEqual([]);
    // A cancelled statement keeps its own rows, and lends them to nobody.
    expect(ids('s5')).toEqual(['expense:e9']);
  });

  it('sameDayStatementIds: the standing statements of the account that day, starting balance excluded', () => {
    const cancelled = statement('s5', 505, '2026-09-28', '2026-09-28T10:45:00Z', {
      cancelledAt: at('2026-09-28T10:50:00Z'),
    });
    expect(
      sameDayStatementIds([start, first, cancelled, second], 'daily_card', d('2026-09-28')),
    ).toEqual(['s1', 's2']);
    expect(sameDayStatementIds([start], 'daily_card', d('2026-09-01'))).toEqual([]);
  });
});
