'use server';

import { getTranslations } from 'next-intl/server';

import { authorizedWorkspace } from '@/lib/actions/authorized-workspace';
import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import type { ActionResult } from '@/lib/actions/types';
import { loadAccountLedger } from '@/lib/data/operations';
import { todayIsoInBrussels } from '@/lib/data/month-situation';
import {
  expectedBalanceOn,
  splitTransferToProvisions,
  startingStatementId,
} from '@/lib/domain/accounts/operations-view';
import { selectLatestStatement } from '@/lib/domain/accounts/solde';
import { validateTransferAllocation } from '@/lib/domain/accounts/virement';
import type { AccountType } from '@/lib/domain/cockpit/types';
import { money } from '@/lib/domain/types';
import {
  balanceStatementSchema,
  incomeReceivedSchema,
  operationCancellationSchema,
  plannedTransferSchema,
} from '@/lib/schemas/operations';
import { log } from '@/lib/log';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import { createClient } from '@/lib/supabase/server';

/*
 * The three account operations of PR C bis, written into the J2 tables
 * (ADR-045). Same gate as every mutation of the app, in the same order:
 * session + elevation + membership (`authorizedWorkspace`), rate limit, Zod,
 * then the write — with `workspace_id` and `created_by` taken from the
 * session, never from the input (the schemas are `.strict()`, so an input that
 * tries is refused).
 *
 * `accounts.balance` (phase « expand », voie A decided by @thierry on
 * 2026-09-21): a STATEMENT keeps the column equal to the latest non-cancelled
 * statement, because the statement replaces the old « edit the balance »
 * gesture. A transfer or an income never touches the column — the cockpit's
 * « Il te reste » reads it through `soldeEpargneActuel`, and its formula is
 * PR D, not this one. The two writes are NOT atomic (two PostgREST requests);
 * a failed second write cancels the statement just written. Atomicity needs an
 * RPC, hence a migration: it comes with the next one.
 */

type Fail = { ok: false; errorCode: string; fieldErrors?: Record<string, string[]> };

async function gate(): Promise<
  | {
      ok: true;
      userId: string;
      workspaceId: string;
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | Fail
> {
  const auth = await authorizedWorkspace();
  if (!auth.ok) return { ok: false, errorCode: auth.errorCode };

  const rl = await rateLimit('mutation', `user:${auth.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  return { ...auth, supabase: await createClient() };
}

function invalid(error: { flatten: () => { fieldErrors: unknown } }): Fail {
  return {
    ok: false,
    errorCode: 'errors.validation.generic',
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

function revalidateOperationPaths() {
  revalidateDashboard();
  revalidateAppPath('accounts');
}

/** A day read or paid in the future is a typo, and it would outrank every real one. */
function futureDay(field: string, value: string): Fail | null {
  if (value <= todayIsoInBrussels()) return null;
  return {
    ok: false,
    errorCode: 'errors.validation.generic',
    fieldErrors: { [field]: ['operations.date.future'] },
  };
}

function isoDayToDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

type Ctx = Extract<Awaited<ReturnType<typeof gate>>, { ok: true }>;

/*
 * Every money gesture writes ONE audit event (decision @thierry, 2026-09-21):
 * which row, which kind, which state change — never an amount, a balance or a
 * description. The audit log leaves in the art. 20 export; it must not double
 * the data it points to.
 */
function auditMovement(
  ctx: Ctx,
  kind: 'transfer' | 'income',
  id: string,
  change?: { cancelled: boolean },
) {
  return logAuditEvent(
    change ? AuditEvent.MOVEMENT_CANCELLATION_SET : AuditEvent.MOVEMENT_RECORDED,
    { userId: ctx.userId, workspaceId: ctx.workspaceId },
    {
      resource_type: `movement_${kind}`,
      resource_id: id,
      ...(change ? cancellationStates(change.cancelled) : {}),
    },
  );
}

function cancellationStates(cancelled: boolean) {
  return cancelled
    ? { previous_state: 'standing', new_state: 'cancelled' }
    : { previous_state: 'cancelled', new_state: 'standing' };
}

/**
 * Undoes a statement write after the balance column refused to follow. When
 * this second write fails too, the statement and the column disagree and no
 * screen says so: the error log carries the row id — never a figure — so the
 * mismatch can be found and repaired by hand.
 */
async function compensateStatement(
  ctx: Ctx,
  id: string,
  cancelledAt: string | null,
  gesture: 'record' | 'cancel' | 'reopen',
) {
  const { data, error } = await ctx.supabase
    .from('account_balance_statements')
    .update({ cancelled_at: cancelledAt })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id');
  // A write refused by RLS returns no error and touches zero rows: count them.
  if (error || (data?.length ?? 0) !== 1) {
    log.error('Statement compensation failed: statement and balance column disagree', {
      statement_id: id,
      gesture,
      error_code: error ? (error.code ?? 'no_code') : 'no_row',
    });
    // The write stands without its gesture's event: leave one that says so.
    await logAuditEvent(
      AuditEvent.ACCOUNT_BALANCE_UPDATED,
      { userId: ctx.userId, workspaceId: ctx.workspaceId },
      {
        resource_type: 'account_balance_statement',
        resource_id: id,
        error_code: 'compensation_failed',
      },
    );
  }
}

/**
 * One line of the monthly plan is done ONCE: a replay, a second tab or a stale
 * « reopen » would otherwise leave two standing transfers, one of them
 * invisible and impossible to cancel from the screen (rule 11). A unique
 * partial index comes with the next migration; until then, this read.
 */
async function planLineAlreadyDone(
  ctx: Ctx,
  line: { from: string; to: string; year: number; month: number },
  exceptId?: string,
): Promise<boolean | null> {
  const { data, error } = await ctx.supabase
    .from('movements')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('kind', 'transfer')
    .eq('from_account_type', line.from)
    .eq('to_account_type', line.to)
    .eq('plan_year', line.year)
    .eq('plan_month', line.month)
    .is('cancelled_at', null);
  if (error) return null;
  return (data ?? []).some((r) => r.id !== exceptId);
}

/**
 * Sets `accounts.balance` to the latest non-cancelled statement of the account.
 * Returns false when the read or the write fails, or when no row was updated.
 */
async function syncBalanceColumn(ctx: Ctx, accountType: AccountType): Promise<boolean> {
  const ledger = await loadAccountLedger(ctx.supabase, ctx.workspaceId);
  if (!ledger.ok) return false;
  const latest = selectLatestStatement(ledger.statements, accountType);
  if (latest === null) return true; // nothing read: the column keeps what it had

  const { data, error } = await ctx.supabase
    .from('accounts')
    .update({ balance: latest.balance.toNumber() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('account_type', accountType)
    .select('account_type');
  return !error && (data?.length ?? 0) === 1;
}

// =========================================================================
// « Quel est le solde de ce compte aujourd'hui ? »
// =========================================================================
export async function recordBalanceStatementAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await gate();
  if (!ctx.ok) return ctx;

  const parsed = balanceStatementSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { accountType, balance, statedOn } = parsed.data;
  const future = futureDay('statedOn', statedOn);
  if (future) return future;

  const ledger = await loadAccountLedger(ctx.supabase, ctx.workspaceId);
  if (!ledger.ok) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  const expected = expectedBalanceOn({
    accountType,
    statements: ledger.statements,
    movements: ledger.movements,
    statedOn: isoDayToDate(statedOn),
  });

  const { data, error } = await ctx.supabase
    .from('account_balance_statements')
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      account_type: accountType,
      balance,
      stated_on: statedOn,
      derived_balance: expected === null ? null : expected.toNumber(),
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, errorCode: 'errors.operations.writeFailed' };

  if (!(await syncBalanceColumn(ctx, accountType))) {
    // Compensation: the statement must not stand while the column disagrees.
    await compensateStatement(ctx, data.id, new Date().toISOString(), 'record');
    return { ok: false, errorCode: 'errors.accounts.balanceUpdateFailed' };
  }

  await logAuditEvent(
    AuditEvent.ACCOUNT_BALANCE_UPDATED,
    { userId: ctx.userId, workspaceId: ctx.workspaceId },
    { resource_type: 'account_balance_statement', resource_id: data.id },
  );

  revalidateOperationPaths();
  return { ok: true, data: { id: data.id } };
}

// =========================================================================
// Cancel / reopen a statement — the column follows the latest standing one
// =========================================================================
export async function setStatementCancelledAction(input: unknown): Promise<ActionResult> {
  const ctx = await gate();
  if (!ctx.ok) return ctx;

  const parsed = operationCancellationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, cancelled } = parsed.data;

  // Read BEFORE writing: the answer depends on the current state. Asking for
  // the state the row is already in writes nothing, audits nothing — and so
  // no compensation can ever flip a row the person had left as it was.
  const ledger = await loadAccountLedger(ctx.supabase, ctx.workspaceId);
  if (!ledger.ok) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  const row = ledger.statements.find((s) => s.id === id);
  if (!row) return { ok: false, errorCode: 'errors.operations.notFound' };
  if ((row.cancelledAt !== null) === cancelled) return { ok: true };

  // The starting balance was never read on an extract; cancelling it would
  // leave the account with no balance at all. The screen hides the button;
  // the server refuses too, since PostgREST is reachable directly.
  if (cancelled && startingStatementId(ledger.statements, row.accountType) === id) {
    return { ok: false, errorCode: 'errors.operations.startingBalance' };
  }

  // The base IMPOSES cancelled_at/cancelled_by (ADR-045 D18); the value sent
  // here only says « cancel » (non-null) or « reopen » (null).
  const { data, error } = await ctx.supabase
    .from('account_balance_statements')
    .update({ cancelled_at: cancelled ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id');

  if (error) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  if (!data || data.length === 0) return { ok: false, errorCode: 'errors.operations.notFound' };

  if (!(await syncBalanceColumn(ctx, row.accountType))) {
    // Back to the state READ above — never a blind inversion.
    await compensateStatement(
      ctx,
      id,
      cancelled ? null : new Date().toISOString(),
      cancelled ? 'cancel' : 'reopen',
    );
    return { ok: false, errorCode: 'errors.accounts.balanceUpdateFailed' };
  }

  await logAuditEvent(
    AuditEvent.ACCOUNT_BALANCE_UPDATED,
    { userId: ctx.userId, workspaceId: ctx.workspaceId },
    // Whitelisted keys, fixed string values: the sanitizer filters key NAMES
    // only, so a value placed under an allowed key would pass as it is.
    {
      resource_type: 'account_balance_statement',
      resource_id: id,
      ...cancellationStates(cancelled),
    },
  );

  revalidateOperationPaths();
  return { ok: true };
}

// =========================================================================
// « J'ai fait ce virement »
// =========================================================================
export async function recordPlannedTransferAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await gate();
  if (!ctx.ok) return ctx;

  const parsed = plannedTransferSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const future = futureDay('occurredOn', v.occurredOn);
  if (future) return future;

  const already = await planLineAlreadyDone(ctx, {
    from: v.fromAccountType,
    to: v.toAccountType,
    year: v.planYear,
    month: v.planMonth,
  });
  if (already === null) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  if (already) return { ok: false, errorCode: 'errors.operations.alreadyDone' };

  const amount = money(v.amount);
  const split =
    v.toAccountType === 'provisions'
      ? splitTransferToProvisions(amount, money(v.plannedProvisions))
      : null;
  const allocation = validateTransferAllocation({
    toAccountType: v.toAccountType,
    amount,
    provisionPart: split?.provisionPart ?? null,
    freeSavingsPart: split?.freeSavingsPart ?? null,
  });
  if (!allocation.ok) return { ok: false, errorCode: 'errors.validation.generic' };

  const { data, error } = await ctx.supabase
    .from('movements')
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      kind: 'transfer',
      from_account_type: v.fromAccountType,
      to_account_type: v.toAccountType,
      amount: v.amount,
      occurred_on: v.occurredOn,
      plan_year: v.planYear,
      plan_month: v.planMonth,
      plan_suggested_amount: v.planSuggestedAmount,
      provision_part: allocation.provisionPart?.toNumber() ?? null,
      free_savings_part: allocation.freeSavingsPart?.toNumber() ?? null,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, errorCode: 'errors.operations.writeFailed' };

  await auditMovement(ctx, 'transfer', data.id);
  revalidateOperationPaths();
  return { ok: true, data: { id: data.id } };
}

// =========================================================================
// « Argent reçu »
// =========================================================================
export async function recordIncomeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await gate();
  if (!ctx.ok) return ctx;

  const parsed = incomeReceivedSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const future = futureDay('occurredOn', v.occurredOn);
  if (future) return future;

  // The base requires a description on an income; the screen does not. Empty
  // → a default by nature, in the person's language, stored as written.
  let description = v.description && v.description.length > 0 ? v.description : null;
  if (description === null) {
    const t = await getTranslations('operations.income');
    description = t(v.nature === 'regular' ? 'defaultRegular' : 'defaultExtra');
  }

  const { data, error } = await ctx.supabase
    .from('movements')
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      kind: 'income',
      to_account_type: v.toAccountType,
      amount: v.amount,
      occurred_on: v.occurredOn,
      income_nature: v.nature,
      description,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, errorCode: 'errors.operations.writeFailed' };

  await auditMovement(ctx, 'income', data.id);
  revalidateOperationPaths();
  return { ok: true, data: { id: data.id } };
}

// =========================================================================
// Cancel / reopen an operation (transfer or income) — never a delete
// =========================================================================
export async function setMovementCancelledAction(input: unknown): Promise<ActionResult> {
  const ctx = await gate();
  if (!ctx.ok) return ctx;

  const parsed = operationCancellationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, cancelled } = parsed.data;

  const { data: row, error: readError } = await ctx.supabase
    .from('movements')
    .select('id, kind, from_account_type, to_account_type, plan_year, plan_month, cancelled_at')
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle();
  if (readError) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  if (!row) return { ok: false, errorCode: 'errors.operations.notFound' };
  if ((row.cancelled_at !== null) === cancelled) return { ok: true };

  // Reopening a plan transfer when the line was done again meanwhile would
  // make two standing transfers for one line.
  if (!cancelled && row.kind === 'transfer' && row.plan_year !== null && row.plan_month !== null) {
    const already = await planLineAlreadyDone(
      ctx,
      {
        from: row.from_account_type ?? '',
        to: row.to_account_type ?? '',
        year: row.plan_year,
        month: row.plan_month,
      },
      id,
    );
    if (already === null) return { ok: false, errorCode: 'errors.operations.writeFailed' };
    if (already) return { ok: false, errorCode: 'errors.operations.alreadyDone' };
  }

  const { data, error } = await ctx.supabase
    .from('movements')
    .update({ cancelled_at: cancelled ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id');

  if (error) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  if (!data || data.length === 0) return { ok: false, errorCode: 'errors.operations.notFound' };

  await auditMovement(ctx, row.kind === 'transfer' ? 'transfer' : 'income', id, { cancelled });
  revalidateOperationPaths();
  return { ok: true };
}
