import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AccountType } from '@/lib/domain/cockpit/types';
import type { AccountBalanceStatement, AccountFlow } from '@/lib/domain/accounts/solde';
import { billPaymentToFlow, expenseToFlow } from '@/lib/domain/accounts/debits';
import { toMoney, type MovementRecord } from '@/lib/domain/accounts/operations-view';
import type { AccountKind } from '@/lib/domain/types';
import type { Database } from '@/lib/supabase/types';

type Client = SupabaseClient<Database>;
type MovementRow = Database['public']['Tables']['movements']['Row'];
type StatementRow = Database['public']['Tables']['account_balance_statements']['Row'];
type ExpenseDebitRow = Pick<
  Database['public']['Tables']['expenses']['Row'],
  'id' | 'amount' | 'occurred_on' | 'created_at' | 'paid_from'
>;
type PaymentDebitRow = Pick<
  Database['public']['Tables']['charge_payments']['Row'],
  'id' | 'paid_amount' | 'paid_at' | 'created_at'
>;

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
  /**
   * ADR-045 D22 — expenses and paid bills (charges and commitment
   * instalments) as outflows of the account they were paid from.
   */
  debits: AccountFlow[];
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
    return { ok: false, statements: [], movements: [], debits: [] };
  }
  const [debits, included] = await Promise.all([
    loadDebits(supabase, workspaceId, statements),
    readAllPages<{ statement_id: string; flow_id: string }>((from, to) =>
      supabase
        .from('statement_included_flows')
        .select('statement_id, flow_id')
        .eq('workspace_id', workspaceId)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);
  if (debits === null || included === null) {
    return { ok: false, statements: [], movements: [], debits: [] };
  }
  // ADR-045 D23 — the per-operation answers travel WITH their statement.
  const byStatement = new Map<string, string[]>();
  for (const r of included) {
    byStatement.set(r.statement_id, [...(byStatement.get(r.statement_id) ?? []), r.flow_id]);
  }
  return {
    ok: true,
    statements: statements.map((row) => ({
      ...statementRowToDomain(row),
      includedFlowIds: byStatement.get(row.id) ?? [],
    })),
    movements: movements.map(movementRowToDomain),
    debits,
  };
}

/**
 * ADR-045 D22 — the expenses and paid bills that can move a derived balance:
 * those of the day of the EARLIEST statement onwards (cancelled ones included,
 * a cancelled statement can be reopened). Nothing before it can count against
 * any statement, so nothing before it is read. No statement: nothing to read.
 *
 * `paid_at` is an instant, and its Brussels day starts up to two hours before
 * UTC midnight (CEST): the bound is taken a whole day earlier, which can only
 * read MORE rows, never fewer, and the domain's hour rule decides.
 * Every read is scoped to the session workspace, like the journal's.
 */
async function loadDebits(
  supabase: Client,
  workspaceId: string,
  statements: readonly StatementRow[],
): Promise<AccountFlow[] | null> {
  if (statements.length === 0) return [];
  // Ordered by (stated_on, recorded_at, id): the first row is the earliest.
  const since = statements[0]!.stated_on;
  const sinceInstant = new Date(`${since}T00:00:00Z`);
  sinceInstant.setUTCDate(sinceInstant.getUTCDate() - 1);
  const sinceIso = sinceInstant.toISOString();

  const [expenses, charges, commitments] = await Promise.all([
    readAllPages<ExpenseDebitRow>((from, to) =>
      supabase
        .from('expenses')
        .select('id, amount, occurred_on, created_at, paid_from')
        .eq('workspace_id', workspaceId)
        .gte('occurred_on', since)
        .order('occurred_on', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    readAllPages<PaymentDebitRow>((from, to) =>
      supabase
        .from('charge_payments')
        .select('id, paid_amount, paid_at, created_at')
        .eq('workspace_id', workspaceId)
        .gte('paid_at', sinceIso)
        .order('paid_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    readAllPages<PaymentDebitRow>((from, to) =>
      supabase
        .from('commitment_payments')
        .select('id, paid_amount, paid_at, created_at')
        .eq('workspace_id', workspaceId)
        .gte('paid_at', sinceIso)
        .order('paid_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);
  if (expenses === null || charges === null || commitments === null) return null;

  const payment = (source: 'charge' | 'commitment') => (row: PaymentDebitRow) =>
    billPaymentToFlow({
      id: row.id,
      source,
      amount: toMoney(row.paid_amount),
      paidAt: new Date(row.paid_at),
      createdAt: new Date(row.created_at),
    });
  return [
    ...expenses.map((row) =>
      expenseToFlow({
        id: row.id,
        amount: toMoney(row.amount),
        occurredOn: row.occurred_on,
        createdAt: new Date(row.created_at),
        paidFrom: row.paid_from as AccountKind,
      }),
    ),
    ...charges.map(payment('charge')),
    ...commitments.map(payment('commitment')),
  ].filter((f): f is AccountFlow => f !== null);
}
