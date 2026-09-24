import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AccountType } from '@/lib/domain/cockpit/types';
import type { AccountBalanceStatement } from '@/lib/domain/accounts/solde';
import { toMoney, type MovementRecord } from '@/lib/domain/accounts/operations-view';
import type { Database } from '@/lib/supabase/types';

type Client = SupabaseClient<Database>;
type MovementRow = Database['public']['Tables']['movements']['Row'];
type StatementRow = Database['public']['Tables']['account_balance_statements']['Row'];

/** `date` columns are days: read at UTC midnight, the convention of `solde.ts` tests. */
function day(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function statementRowToDomain(row: StatementRow): AccountBalanceStatement {
  return {
    id: row.id,
    accountType: row.account_type as AccountType,
    balance: toMoney(row.balance),
    statedOn: day(row.stated_on),
    recordedAt: new Date(row.recorded_at),
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
  };
}

export function movementRowToDomain(row: MovementRow): MovementRecord {
  return {
    id: row.id,
    kind: row.kind as MovementRecord['kind'],
    fromAccountType: (row.from_account_type as AccountType | null) ?? null,
    toAccountType: (row.to_account_type as AccountType | null) ?? null,
    amount: toMoney(row.amount),
    occurredOn: day(row.occurred_on),
    recordedAt: new Date(row.recorded_at),
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    planYear: row.plan_year,
    planMonth: row.plan_month,
    planSuggestedAmount:
      row.plan_suggested_amount === null ? null : toMoney(row.plan_suggested_amount),
    provisionPart: row.provision_part === null ? null : toMoney(row.provision_part),
    freeSavingsPart: row.free_savings_part === null ? null : toMoney(row.free_savings_part),
    incomeNature: (row.income_nature as MovementRecord['incomeNature']) ?? null,
    budgetYear: row.budget_year ?? null,
    budgetMonth: row.budget_month ?? null,
    description: row.description,
  };
}

export type AccountLedger = {
  statements: AccountBalanceStatement[];
  movements: MovementRecord[];
};

/**
 * Every statement and every operation of the workspace, cancelled ones
 * included — a cancelled line stays readable and offers its reopening. Read
 * through the person's own client: RLS (`is_workspace_member`) is the filter
 * that matters, the `workspace_id` equality only narrows to the active one.
 *
 * A read error returns EMPTY lists with `ok: false` rather than throwing; the
 * callers must then show NO gesture and no derived figure, never « nothing
 * done ».
 *
 * PR D — the journal is read PAGE BY PAGE. The old guard read a page reaching
 * PostgREST's row cap (1 000) as a failed read; since « Il te reste » depends
 * on this read, a workspace that reached 1 000 lines by normal use (a
 * cancellation never deletes a row) would have lost its cockpit for good. The
 * order ends on `id` so that two pages can neither repeat nor skip a row.
 */
const PAGE = 1000;
/** 50 000 lines: far beyond any use; past it, a loop would be a defect. */
const MAX_PAGES = 50;

async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const { data, error } = await page(i * PAGE, (i + 1) * PAGE - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
  return null;
}

export async function loadAccountLedger(
  supabase: Client,
  workspaceId: string,
): Promise<AccountLedger & { ok: boolean }> {
  const [statements, movements] = await Promise.all([
    readAllPages<StatementRow>((from, to) =>
      supabase
        .from('account_balance_statements')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('stated_on', { ascending: true })
        .order('recorded_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    readAllPages<MovementRow>((from, to) =>
      supabase
        .from('movements')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('occurred_on', { ascending: true })
        .order('recorded_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  if (statements === null || movements === null) {
    return { ok: false, statements: [], movements: [] };
  }
  return {
    ok: true,
    statements: statements.map(statementRowToDomain),
    movements: movements.map(movementRowToDomain),
  };
}
