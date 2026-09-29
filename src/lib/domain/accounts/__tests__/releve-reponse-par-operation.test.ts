import { describe, expect, it } from 'vitest';

import { money } from '@/lib/domain/types';
import { accountBalanceView } from '../operations-view';
import {
  flowCountsAfterStatement,
  measureStatementGap,
  type AccountBalanceStatement,
  type AccountFlow,
} from '../solde';

/*
 * ADR-045 D23 — the same-day question is answered PER OPERATION. A statement
 * read on the 28th at 09:00, then two operations of that same day written after
 * it: a bill the bank had already debited (inside the balance) and an expense
 * made after the reading (not inside). One answer per statement cannot say both;
 * one answer per operation can. Fictitious figures only.
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

function out(
  id: string,
  amount: number,
  occurredOn: string,
  recordedAt: string,
  origin: 'bill' | 'expense',
): AccountFlow {
  return {
    id,
    accountType: 'daily_card',
    direction: 'out',
    amount: money(amount),
    occurredOn: d(occurredOn),
    recordedAt: at(recordedAt),
    cancelledAt: null,
    origin,
  };
}

const start = statement('s0', 705, '2026-09-01', '2026-09-01T08:00:00Z');
const bill = out('charge_payment:b1', 2.99, '2026-09-28', '2026-09-28T10:00:00Z', 'bill');
const spend = out('expense:e1', 5, '2026-09-28', '2026-09-28T10:05:00Z', 'expense');

describe('flowCountsAfterStatement — an answer per operation (ADR-045 D23)', () => {
  it('a same-day flow written after the statement and answered « already inside » does not count', () => {
    const s = statement('s1', 505, '2026-09-28', '2026-09-28T09:00:00Z', [bill.id]);
    expect(flowCountsAfterStatement(s, bill)).toBe(false);
    expect(flowCountsAfterStatement(s, spend)).toBe(true);
  });

  it('an answer never reaches a flow of a LATER day: that one counts, and rightly', () => {
    const later = out('expense:e2', 7, '2026-09-29', '2026-09-29T10:00:00Z', 'expense');
    const s = statement('s1', 505, '2026-09-28', '2026-09-28T09:00:00Z', [later.id]);
    expect(flowCountsAfterStatement(s, later)).toBe(true);
  });

  it('a statement without answers keeps the hour rule of D16', () => {
    const s = statement('s1', 505, '2026-09-28', '2026-09-28T09:00:00Z');
    expect(flowCountsAfterStatement(s, bill)).toBe(true);
    expect(flowCountsAfterStatement(s, spend)).toBe(true);
  });
});

describe('accountBalanceView — two operations of the day, two different answers', () => {
  const read = statement('s1', 505, '2026-09-28', '2026-09-28T09:00:00Z', [bill.id]);

  it('the computed balance is the read balance minus the expense only', () => {
    const view = accountBalanceView({
      accountType: 'daily_card',
      statements: [start, read],
      movements: [],
      debits: [bill, spend],
      today: d('2026-09-29'),
    });
    expect(view?.computed?.balance.toFixed(2)).toBe('500.00');
    expect(view?.computed?.contributions.map((c) => c.flow.id)).toEqual([spend.id]);
  });

  it('the card names BOTH operations of the day, each with its own answer', () => {
    const view = accountBalanceView({
      accountType: 'daily_card',
      statements: [start, read],
      movements: [],
      debits: [bill, spend],
      today: d('2026-09-29'),
    });
    expect(view?.sameDayAfter?.flows.map((f) => f.id)).toEqual([spend.id]);
    expect(view?.sameDayAfter?.included.map((f) => f.id)).toEqual([bill.id]);
    expect(view?.sameDayAfter?.total.toFixed(2)).toBe('-5.00');
  });

  it('answering one operation never changes how another one counts', () => {
    const none = statement('s1', 505, '2026-09-28', '2026-09-28T09:00:00Z');
    const onlyBill = statement('s1', 505, '2026-09-28', '2026-09-28T09:00:00Z', [bill.id]);
    expect(flowCountsAfterStatement(none, spend)).toBe(flowCountsAfterStatement(onlyBill, spend));
  });

  it('the gap of the statement counts the operation it contains', () => {
    const gap = measureStatementGap({ statement: read, anchor: start, flows: [bill, spend] });
    // 705 − 2,99 (inside the reading) = 702,01 expected; the expense comes after.
    expect(gap.derived.toFixed(2)).toBe('702.01');
    expect(gap.contributions.map((c) => c.flow.id)).toEqual([bill.id]);
  });
});

describe('withIncludedFlows — answers travel only with a statement that can hold them', () => {
  const rows = [
    { statement_id: 's0', flow_id: bill.id },
    { statement_id: 's1', flow_id: spend.id },
  ];

  it('never attaches an answer to the starting balance (security review, 2026-09-29)', async () => {
    const { withIncludedFlows } = await import('../operations-view');
    const s1 = statement('s1', 505, '2026-09-28', '2026-09-28T09:00:00Z');
    const out = withIncludedFlows([start, s1], rows);
    expect(out.find((s) => s.id === 's0')?.includedFlowIds).toEqual([]);
    expect(out.find((s) => s.id === 's1')?.includedFlowIds).toEqual([spend.id]);
  });
});
