import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { loadAccountLedger } from '@/lib/data/operations';

/**
 * PR D — `loadAccountLedger` now feeds « Il te reste ». Its old guard read a
 * page reaching PostgREST's row cap (1 000) as a FAILED read, which PR D turns
 * into the read-failure screen: a workspace that reached 1 000 operations by
 * normal use (cancelling never deletes a row) would have lost its cockpit for
 * good. The journal is now read page by page. Found by the Sécurité review.
 */
function movementRow(i: number) {
  return {
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    kind: 'transfer',
    from_account_type: 'income_bills',
    to_account_type: 'daily_card',
    amount: 1,
    occurred_on: '2026-09-03',
    recorded_at: '2026-09-03T08:00:00Z',
    cancelled_at: null,
    plan_year: null,
    plan_month: null,
    plan_suggested_amount: null,
    provision_part: null,
    free_savings_part: null,
    income_nature: null,
    description: null,
  };
}

function fakeClient(tables: Record<string, unknown[]>, cap = 1000) {
  const ranges: Array<[string, number, number]> = [];
  const client = {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: async (from: number, to: number) => {
          ranges.push([table, from, to]);
          const rows = tables[table] ?? [];
          return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
        },
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: (tables[table] ?? []).slice(0, cap), error: null }),
      };
      return builder;
    },
  };
  return { client, ranges };
}

describe('loadAccountLedger — beyond the row cap', () => {
  it('reads 1 005 operations in full instead of reporting a failed read', async () => {
    const movements = Array.from({ length: 1005 }, (_, i) => movementRow(i));
    const { client } = fakeClient({ movements, account_balance_statements: [] });
    const out = await loadAccountLedger(client as never, 'ws-fictif');
    expect(out.ok).toBe(true);
    expect(out.movements).toHaveLength(1005);
  });

  it('still reports a genuine read error as a failed read', async () => {
    const client = {
      from: () => {
        const b = {
          select: () => b,
          eq: () => b,
          order: () => b,
          range: async () => ({ data: null, error: { message: 'boom' } }),
          then: (resolve: (v: unknown) => void) =>
            resolve({ data: null, error: { message: 'boom' } }),
        };
        return b;
      },
    };
    const out = await loadAccountLedger(client as never, 'ws-fictif');
    expect(out.ok).toBe(false);
    expect(out.movements).toEqual([]);
  });
});
