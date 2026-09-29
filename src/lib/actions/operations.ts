'use server';

import Decimal from 'decimal.js';
import { getTranslations } from 'next-intl/server';

import { authorizedWorkspace } from '@/lib/actions/authorized-workspace';
import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import type { IncomeCorrectionEffect } from '@/lib/actions/operations.types';
import type { ActionResult } from '@/lib/actions/types';
import { loadWorkspaceCharges } from '@/lib/data/charge-row';
import { loadAccountLedger } from '@/lib/data/operations';
import { todayIsoInBrussels } from '@/lib/data/month-situation';
import {
  expectedBalanceOn,
  ledgerFlows,
  sameDayFlowsAfter,
  sameDayFlowsIncluded,
  sameDayStatement,
  splitTransferToProvisions,
  startingStatementId,
  toMoney,
  type MovementRecord,
} from '@/lib/domain/accounts/operations-view';
import { selectLatestStatement, type AccountBalanceStatement } from '@/lib/domain/accounts/solde';
import {
  splitByRule,
  splitDiffersFromRule,
  splitRuleApplies,
} from '@/lib/domain/accounts/split-rule';
import { effetDeLaCorrection } from '@/lib/domain/accounts/correction-montant';
import { validateTransferAllocation } from '@/lib/domain/accounts/virement';
import { moisDeBudgetEnCours } from '@/lib/domain/budget/mois-de-budget';
import type { AccountType } from '@/lib/domain/cockpit/types';
import { transferPlanAllowed } from '@/lib/domain/period/viewed-period';
import { provisionPartOfMonth } from '@/lib/domain/transfer';
import { money } from '@/lib/domain/types';
import {
  balanceStatementSchema,
  flowIncludedSchema,
  incomeAmountCorrectionSchema,
  incomeReceivedSchema,
  operationCancellationSchema,
  plannedTransferSchema,
  requiredStatementAnswersSchema,
  transferSplitRecalculationSchema,
} from '@/lib/schemas/operations';
import { log } from '@/lib/log';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import { moisDeLaDate } from '@/lib/domain/accounts/mois-concerne';
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
 * gesture. A transfer or an income never touches the column, so it is the
 * balance of the latest statement, not the balance of the account. Since
 * tour 59 NOTHING reads it: every screen reads `accountBalanceView` (statement
 * plus the operations since), and a guard test forbids a new reader. The
 * column waits for its contraction (ADR-045). The two writes are NOT atomic (two PostgREST requests);
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
type MovementChange =
  { cancelled: boolean } | { splitRecalculated: true } | { amountCorrected: true };

function auditMovement(ctx: Ctx, kind: 'transfer' | 'income', id: string, change?: MovementChange) {
  const cancellation = change && 'cancelled' in change ? change : null;
  return logAuditEvent(
    cancellation ? AuditEvent.MOVEMENT_CANCELLATION_SET : AuditEvent.MOVEMENT_RECORDED,
    { userId: ctx.userId, workspaceId: ctx.workspaceId },
    {
      resource_type: `movement_${kind}`,
      resource_id: id,
      ...(cancellation ? cancellationStates(cancellation.cancelled) : {}),
      // Fixed strings under whitelisted keys: the parts themselves never travel.
      ...(change && 'splitRecalculated' in change
        ? { previous_state: 'split_outdated', new_state: 'split_by_rule' }
        : {}),
      ...(change && 'amountCorrected' in change
        ? { previous_state: 'amount_as_written', new_state: 'amount_corrected' }
        : {}),
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
// ADR-045 D21/D23 — « Ton solde du … contient-il déjà cet argent ? »,
// answered for THIS operation only (D23)
// =========================================================================

type StatementAnswers = Partial<Record<AccountType, 'included' | 'notYet'>> | undefined;

/**
 * The statements an operation of `day` touching `accounts` could be counted
 * twice against, and the ones the person said already held it. The answer is
 * REQUIRED for each such statement (Zod, never a default): an operation sent
 * without it is refused before anything is written. An answer for an account
 * whose statement is not of that day is ignored — a statement cancelled
 * between the screen and the click must not block the write.
 *
 * D23 — an answer only ever concerns the operation being written: the other
 * operations of that day keep what they were answered, so nothing here
 * depends on them.
 */
function sameDayAnswers(
  statements: readonly AccountBalanceStatement[],
  accounts: readonly AccountType[],
  day: string,
  answers: StatementAnswers,
): Fail | { toInclude: AccountBalanceStatement[] } {
  const asked = accounts.flatMap((a) => {
    const s = sameDayStatement(statements, a, isoDayToDate(day));
    return s ? [s] : [];
  });
  const parsed = requiredStatementAnswersSchema(asked.map((s) => s.accountType)).safeParse(
    answers ?? {},
  );
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: { statementAnswers: ['operations.sameDay.required'] },
    };
  }
  return { toInclude: asked.filter((s) => answers?.[s.accountType] === 'included') };
}

/** Sets `cancelled_at` on one row of the workspace; logs ids only when it fails. */
async function setOwnCancelled(
  ctx: Ctx,
  table: 'movements',
  id: string,
  cancelled: boolean,
): Promise<void> {
  const { data, error } = await ctx.supabase
    .from(table)
    .update({ cancelled_at: cancelled ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id');
  if (error || (data?.length ?? 0) !== 1) {
    // Ids only — never an amount nor a description.
    log.error('Same-day answer: undo failed, a row stands alone', {
      table,
      row_id: id,
      gesture: cancelled ? 'cancel' : 'reopen',
      error_code: error ? (error.code ?? 'no_code') : 'no_row',
    });
  }
}

/** One event per answer written or withdrawn: which row, never an amount. */
function auditInclusion(ctx: Ctx, inclusionId: string) {
  return logAuditEvent(
    AuditEvent.ACCOUNT_BALANCE_UPDATED,
    { userId: ctx.userId, workspaceId: ctx.workspaceId },
    { resource_type: 'statement_included_flow', resource_id: inclusionId },
  );
}

/**
 * Writes « the balance of `statementId` already held `flowId` ». Returns the
 * id of the row, or null when the write fails or is refused silently (RLS
 * returns no error and no row: the rows are counted).
 */
async function insertInclusion(
  ctx: Ctx,
  statementId: string,
  flowId: string,
): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from('statement_included_flows')
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      statement_id: statementId,
      flow_id: flowId,
    })
    .select('id');
  if (error || !data || data.length !== 1) return null;
  return data[0]!.id;
}

/**
 * « Oui, déjà dedans », once the operation is written: one answer per
 * statement, for THIS operation's flow on that statement's account — never a
 * statement written or rewritten (ADR-045 D23). On a failure, what this
 * gesture wrote is undone — the answers already written, then the operation —
 * so the person finds the state of before and an error, never half a gesture.
 * Without an RPC this is not atomic: an undo that fails itself is logged by
 * row id.
 */
async function includeAfterOperation(
  ctx: Ctx,
  movementId: string,
  toInclude: readonly AccountBalanceStatement[],
): Promise<boolean> {
  if (toInclude.length === 0) return true;
  const ledger = await loadAccountLedger(ctx.supabase, ctx.workspaceId);
  const written: string[] = [];
  let failed = !ledger.ok;
  if (ledger.ok) {
    const flows = ledgerFlows(ledger.movements, ledger.debits);
    for (const statement of toInclude) {
      // Still the statement the answer was given for (a second tab may have
      // read another balance meanwhile), and this operation's own flow on its
      // account, counted after it: otherwise, stop.
      const still = sameDayStatement(ledger.statements, statement.accountType, statement.statedOn);
      const flow =
        still?.id === statement.id
          ? sameDayFlowsAfter(still, flows).find(
              (f) => f.id.startsWith(`${movementId}:`) && f.accountType === statement.accountType,
            )
          : undefined;
      const inclusionId = flow ? await insertInclusion(ctx, statement.id, flow.id) : null;
      if (inclusionId === null) {
        failed = true;
        break;
      }
      written.push(inclusionId);
    }
  }
  if (!failed) {
    for (const id of written) await auditInclusion(ctx, id);
    return true;
  }

  for (const id of written.reverse()) await deleteOwnInclusion(ctx, id);
  await setOwnCancelled(ctx, 'movements', movementId, true);
  return false;
}

/** Withdraws one answer written by this gesture; logs ids only when it fails. */
async function deleteOwnInclusion(ctx: Ctx, id: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('statement_included_flows')
    .delete()
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id');
  if (error || (data?.length ?? 0) !== 1) {
    log.error('Same-day answer: undo failed, a row stands alone', {
      table: 'statement_included_flows',
      row_id: id,
      gesture: 'withdraw',
      error_code: error ? (error.code ?? 'no_code') : 'no_row',
    });
  }
}

// =========================================================================
// « Déjà dedans » / « Fait après » — the card of the account, per operation
// =========================================================================
export async function setFlowIncludedAction(input: unknown): Promise<ActionResult> {
  const ctx = await gate();
  if (!ctx.ok) return ctx;

  const parsed = flowIncludedSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { statementId, flowId, included } = parsed.data;

  // The ledger is read for the SESSION workspace: a statement or an operation
  // of another workspace is absent from it, and so not found.
  const ledger = await loadAccountLedger(ctx.supabase, ctx.workspaceId);
  if (!ledger.ok) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  const row = ledger.statements.find((s) => s.id === statementId);
  // Only the latest standing statement, never the starting balance: anything
  // else is a stale screen.
  const target = row ? sameDayStatement(ledger.statements, row.accountType, row.statedOn) : null;
  if (!target || target.id !== statementId) {
    return { ok: false, errorCode: 'errors.operations.notFound' };
  }

  // The flow must be one the card offers for this answer: same account, same
  // day, written after the statement, standing — counted after it for
  // « Déjà dedans », already answered for « Fait après ».
  const flows = ledgerFlows(ledger.movements, ledger.debits);
  const offered = included ? sameDayFlowsAfter(target, flows) : sameDayFlowsIncluded(target, flows);
  if (!offered.some((f) => f.id === flowId)) {
    return { ok: false, errorCode: 'errors.operations.notFound' };
  }

  let rowId: string | null;
  if (included) {
    rowId = await insertInclusion(ctx, statementId, flowId);
  } else {
    const { data, error } = await ctx.supabase
      .from('statement_included_flows')
      .delete()
      .eq('workspace_id', ctx.workspaceId)
      .eq('statement_id', statementId)
      .eq('flow_id', flowId)
      .select('id');
    rowId = !error && data && data.length === 1 ? data[0]!.id : null;
  }
  if (rowId === null) return { ok: false, errorCode: 'errors.operations.writeFailed' };

  await auditInclusion(ctx, rowId);
  revalidateOperationPaths();
  return { ok: true };
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
    debits: ledger.debits,
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

  const ledger = await loadAccountLedger(ctx.supabase, ctx.workspaceId);
  if (!ledger.ok) return { ok: false, errorCode: 'errors.operations.writeFailed' };

  // The screen offers the gesture for the running budget month and the next
  // one only (`transferPlanAllowed`); the server holds the same line, since
  // an action is callable without the screen. The running month is computed
  // HERE, from the journal just read, by the function the cockpit's snapshot
  // uses (ADR-047) — never taken from the client.
  const moisCourant = moisDeBudgetEnCours(ledger.movements, todayIsoInBrussels(), new Date());
  if (!transferPlanAllowed({ year: v.planYear, month: v.planMonth }, moisCourant)) {
    return { ok: false, errorCode: 'errors.operations.planMonthNotAllowed' };
  }

  const sameDay = sameDayAnswers(
    ledger.statements,
    [v.fromAccountType, v.toAccountType],
    v.occurredOn,
    v.statementAnswers,
  );
  if ('ok' in sameDay) return sameDay;

  const already = await planLineAlreadyDone(ctx, {
    from: v.fromAccountType,
    to: v.toAccountType,
    year: v.planYear,
    month: v.planMonth,
  });
  if (already === null) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  if (already) return { ok: false, errorCode: 'errors.operations.alreadyDone' };

  const amount = money(v.amount);
  // Tour 55 — the provisions share is computed HERE, from the workspace's
  // charges and the plan month, with the same domain rule the screen shows
  // (`provisionPartOfMonth`). `v.plannedProvisions` is never written: a client
  // could otherwise move any euro between provisions and free savings, and
  // « Mis de côté » would say whatever it was sent.
  let split: ReturnType<typeof splitTransferToProvisions> | null = null;
  if (v.toAccountType === 'provisions') {
    const charges = await loadWorkspaceCharges(ctx.supabase, ctx.workspaceId);
    if (charges === null) return { ok: false, errorCode: 'errors.operations.writeFailed' };
    split = splitTransferToProvisions(amount, provisionPartOfMonth(charges, v.planMonth));
  }
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

  if (!(await includeAfterOperation(ctx, data.id, sameDay.toInclude))) {
    return { ok: false, errorCode: 'errors.operations.writeFailed' };
  }

  await auditMovement(ctx, 'transfer', data.id);
  revalidateOperationPaths();
  return { ok: true, data: { id: data.id } };
}

// =========================================================================
// « Argent reçu »
// =========================================================================
function budgetColumns(occurredOn: string, budgetMonth: string | undefined) {
  if (budgetMonth === undefined || budgetMonth === moisDeLaDate(occurredOn)) return {};
  const [y, m] = budgetMonth.split('-').map(Number) as [number, number];
  return { budget_year: y, budget_month: m };
}

export async function recordIncomeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await gate();
  if (!ctx.ok) return ctx;

  const parsed = incomeReceivedSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const future = futureDay('occurredOn', v.occurredOn);
  if (future) return future;

  const ledger = await loadAccountLedger(ctx.supabase, ctx.workspaceId);
  if (!ledger.ok) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  const sameDay = sameDayAnswers(
    ledger.statements,
    [v.toAccountType],
    v.occurredOn,
    v.statementAnswers,
  );
  if ('ok' in sameDay) return sameDay;

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
      // ADR-046 — written only when it differs from the month of the date:
      // without it the row already counts for that month, and a NULL keeps
      // the invariant « an assignment says something the date does not ».
      ...budgetColumns(v.occurredOn, v.budgetMonth),
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, errorCode: 'errors.operations.writeFailed' };

  if (!(await includeAfterOperation(ctx, data.id, sameDay.toInclude))) {
    return { ok: false, errorCode: 'errors.operations.writeFailed' };
  }

  await auditMovement(ctx, 'income', data.id);
  revalidateOperationPaths();
  return { ok: true, data: { id: data.id } };
}

// =========================================================================
// Tour 57 — « Corriger le montant » of money received. Cancelling and writing
// it again was blocked by D21 (until D23) as soon as another operation of its
// day followed the statement; the base lets the amount be corrected in place (D17). Same
// row, same date, same write time, same month, same account: only the amount.
// =========================================================================
export async function correctIncomeAmountAction(
  input: unknown,
): Promise<ActionResult<IncomeCorrectionEffect>> {
  const ctx = await gate();
  if (!ctx.ok) return ctx;

  const parsed = incomeAmountCorrectionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, amount } = parsed.data;

  const { data: row, error: readError } = await ctx.supabase
    .from('movements')
    .select('id, kind, to_account_type, amount, cancelled_at')
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle();
  if (readError) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  if (!row || row.kind !== 'income' || row.to_account_type === null) {
    return { ok: false, errorCode: 'errors.operations.notFound' };
  }
  // A cancelled row is frozen by the base (D15): reopen it first.
  if (row.cancelled_at !== null) return { ok: false, errorCode: 'errors.operations.cancelledRow' };
  if (new Decimal(row.amount).equals(amount)) return { ok: true, data: { effet: 'identique' } };

  // What the balance on screen will do, measured BEFORE the write on the
  // journal the cards read — so the confirmation cannot promise what is false.
  const ledger = await loadAccountLedger(ctx.supabase, ctx.workspaceId);
  if (!ledger.ok || !ledger.movements.some((m) => m.id === id)) {
    return { ok: false, errorCode: 'errors.operations.writeFailed' };
  }
  const effet = effetDeLaCorrection({
    accountType: row.to_account_type as AccountType,
    statements: ledger.statements,
    movements: ledger.movements,
    debits: ledger.debits,
    today: isoDayToDate(todayIsoInBrussels()),
    movementId: id,
    nouveauMontant: new Decimal(amount),
  });

  const { data, error } = await ctx.supabase
    .from('movements')
    .update({ amount })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .is('cancelled_at', null)
    .select('id');
  if (error) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  // RLS lets only the author update: zero row is « not yours », never a success.
  if (!data || data.length === 0) return { ok: false, errorCode: 'errors.operations.notFound' };

  await auditMovement(ctx, 'income', id, { amountCorrected: true });
  revalidateOperationPaths();
  if (effet.effet === 'ancre') {
    return {
      ok: true,
      data: {
        effet: 'ancre',
        releveLe: effet.releveLe.toISOString().slice(0, 10),
        depart: effet.depart,
        ecart: effet.ecart && {
          avant: effet.ecart.avant.toNumber(),
          apres: effet.ecart.apres.toNumber(),
        },
      },
    };
  }
  if (effet.effet === 'change') {
    return {
      ok: true,
      data: { effet: 'change', avant: effet.avant.toNumber(), apres: effet.apres.toNumber() },
    };
  }
  return { ok: true, data: { effet: 'aucunSolde' } };
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

// =========================================================================
// « Recalculer le découpage » — a transfer to the provisions written before
// `provisionPartOfMonth` (#505) keeps the target as its provisions share.
// Cancelling and writing it again was blocked by D21 (until D23) as soon as
// another operation of its day followed the statement: this corrects the two parts
// in place, which the base allows (« la ventilation » se corrige, D17).
// =========================================================================
export async function recalculateTransferSplitAction(input: unknown): Promise<ActionResult> {
  const ctx = await gate();
  if (!ctx.ok) return ctx;

  const parsed = transferSplitRecalculationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id } = parsed.data;

  // Read in the SESSION workspace: an id of another workspace is not found.
  const { data: row, error: readError } = await ctx.supabase
    .from('movements')
    .select(
      'id, kind, to_account_type, amount, plan_year, plan_month, provision_part, free_savings_part, cancelled_at',
    )
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle();
  if (readError) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  if (!row) return { ok: false, errorCode: 'errors.operations.notFound' };

  const movement = {
    kind: row.kind as MovementRecord['kind'],
    toAccountType: (row.to_account_type as AccountType | null) ?? null,
    amount: toMoney(row.amount),
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    planYear: row.plan_year,
    planMonth: row.plan_month,
    provisionPart: row.provision_part === null ? null : toMoney(row.provision_part),
    freeSavingsPart: row.free_savings_part === null ? null : toMoney(row.free_savings_part),
  };
  // Cancelled, not a plan transfer to the provisions: a stale screen — the
  // button is only shown where the rule applies.
  if (!splitRuleApplies(movement)) {
    return { ok: false, errorCode: 'errors.operations.notFound' };
  }

  // Security review, tour 56 — the same month window as the write: the
  // running budget month (computed here from the journal) and the next one.
  // Without it, a May transfer would be re-split with today's bills.
  const ledger = await loadAccountLedger(ctx.supabase, ctx.workspaceId);
  if (!ledger.ok) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  const moisCourant = moisDeBudgetEnCours(ledger.movements, todayIsoInBrussels(), new Date());
  if (
    !transferPlanAllowed(
      { year: movement.planYear as number, month: movement.planMonth as number },
      moisCourant,
    )
  ) {
    return { ok: false, errorCode: 'errors.operations.planMonthNotAllowed' };
  }

  const charges = await loadWorkspaceCharges(ctx.supabase, ctx.workspaceId);
  if (charges === null) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  // Idempotent: a split already equal to the rule writes and audits nothing.
  if (!splitDiffersFromRule(movement, charges)) return { ok: true };
  const split = splitByRule(movement, charges);
  const allocation = validateTransferAllocation({
    toAccountType: 'provisions',
    amount: movement.amount,
    provisionPart: split?.provisionPart ?? null,
    freeSavingsPart: split?.freeSavingsPart ?? null,
  });
  if (!allocation.ok) return { ok: false, errorCode: 'errors.validation.generic' };

  // The two parts ONLY: the amount, the day and the write time stay as they
  // were written (`recorded_at` is frozen by the base anyway, D17).
  const { data, error } = await ctx.supabase
    .from('movements')
    .update({
      provision_part: allocation.provisionPart?.toNumber() ?? null,
      free_savings_part: allocation.freeSavingsPart?.toNumber() ?? null,
    })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id');

  if (error) return { ok: false, errorCode: 'errors.operations.writeFailed' };
  // Zero row: RLS lets only the author update — another member's transfer.
  if (!data || data.length === 0) return { ok: false, errorCode: 'errors.operations.notFound' };

  await auditMovement(ctx, 'transfer', id, { splitRecalculated: true });
  revalidateOperationPaths();
  return { ok: true };
}
