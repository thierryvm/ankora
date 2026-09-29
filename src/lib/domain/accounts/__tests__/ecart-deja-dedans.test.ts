import { describe, expect, it } from 'vitest';

import { money } from '@/lib/domain/types';
import { accountBalanceView, type MovementRecord } from '../operations-view';
import type { AccountBalanceStatement, AccountFlow } from '../solde';

/*
 * Tour 58, point 9 — a statement, then an operation of its own day written
 * after it and answered « Déjà dedans »: the computed balance is the statement
 * itself, and the gap with the previous statement must be zero when the
 * statement really held the operation. Fictitious figures (505 / 705).
 */

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const at = (iso: string) => new Date(iso);

function statement(
  id: string,
  balance: number,
  statedOn: string,
  recordedAt: string,
  includedFlowIds: readonly string[] = [],
): AccountBalanceStatement {
  return {
    id,
    accountType: 'daily_card',
    balance: money(balance),
    statedOn: d(statedOn),
    recordedAt: at(recordedAt),
    cancelledAt: null,
    includedFlowIds,
  };
}

const start = statement('s0', 705, '2026-09-01', '2026-09-01T08:00:00Z');

function bill(occurredOn: string, recordedAt: string | null): AccountFlow {
  return {
    id: 'charge_payment:b1',
    accountType: 'daily_card',
    direction: 'out',
    amount: money(200),
    occurredOn: d(occurredOn),
    recordedAt: recordedAt === null ? null : at(recordedAt),
    cancelledAt: null,
    origin: 'bill',
  };
}

function view(
  statements: AccountBalanceStatement[],
  debits: AccountFlow[],
  movements: MovementRecord[] = [],
) {
  return accountBalanceView({
    accountType: 'daily_card',
    statements,
    movements,
    debits,
    today: d('2026-09-28'),
  });
}

describe('the gap follows the « Déjà dedans » answer (ADR-045 D23)', () => {
  it('statement after the starting balance, same-day bill answered inside → gap 0', () => {
    const f = bill('2026-09-28', '2026-09-28T10:00:00Z');
    const read = statement('s1', 505, '2026-09-28', '2026-09-28T09:00:00Z', [f.id]);
    const v = view([start, read], [f]);
    expect(v?.computed).toBeNull();
    expect(v?.gap).toBeNull();
  });

  it('two statements, the latest answered inside → gap 0 against the previous one', () => {
    const f = bill('2026-09-28', '2026-09-28T10:00:00Z');
    const mid = statement('s1', 705, '2026-09-10', '2026-09-10T09:00:00Z');
    const read = statement('s2', 505, '2026-09-28', '2026-09-28T09:00:00Z', [f.id]);
    const v = view([start, mid, read], [f]);
    expect(v?.gap).toBeNull();
  });

  it('a movement of the day (transfer out) answered inside → gap 0', () => {
    const m: MovementRecord = {
      id: 'm1',
      kind: 'transfer',
      fromAccountType: 'daily_card',
      toAccountType: 'savings',
      amount: money(200),
      occurredOn: d('2026-09-28'),
      recordedAt: at('2026-09-28T10:00:00Z'),
      cancelledAt: null,
    } as unknown as MovementRecord;
    const read = statement('s1', 505, '2026-09-28', '2026-09-28T09:00:00Z', ['m1:out']);
    const v = view([start, read], [], [m]);
    expect(v?.computed).toBeNull();
    expect(v?.gap).toBeNull();
  });
});
