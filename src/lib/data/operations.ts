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
 * done ». A read that reaches PostgREST's row cap is treated as failed too:
 * the ascending order would cut the MOST RECENT rows, silently.
 */
const ROW_CAP = 1000;

export async function loadAccountLedger(
  supabase: Client,
  workspaceId: string,
): Promise<AccountLedger & { ok: boolean }> {
  const [statementsRes, movementsRes] = await Promise.all([
    supabase
      .from('account_balance_statements')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('stated_on', { ascending: true })
      .order('recorded_at', { ascending: true }),
    supabase
      .from('movements')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('occurred_on', { ascending: true })
      .order('recorded_at', { ascending: true }),
  ]);

  if (
    statementsRes.error ||
    movementsRes.error ||
    (statementsRes.data?.length ?? 0) >= ROW_CAP ||
    (movementsRes.data?.length ?? 0) >= ROW_CAP
  ) {
    return { ok: false, statements: [], movements: [] };
  }
  return {
    ok: true,
    statements: (statementsRes.data ?? []).map(statementRowToDomain),
    movements: (movementsRes.data ?? []).map(movementRowToDomain),
  };
}
