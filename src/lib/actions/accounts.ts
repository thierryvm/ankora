'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import { accountBalanceSchema, accountLabelSchema } from '@/lib/schemas/account';
import { monthlyIncomeSchema, vieCouranteTransferSchema } from '@/lib/schemas/workspace';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import type { ActionResult } from '@/lib/actions/types';

async function resolveSessionWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, errorCode: 'errors.session.expired' };

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'editor'])
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return { ok: false as const, errorCode: 'errors.db.workspaceNotFound' };

  return {
    ok: true as const,
    supabase,
    user,
    workspaceId: membership.workspace_id,
  };
}

function revalidateAccountPaths() {
  revalidateDashboard();
  revalidateAppPath('accounts');
}

// =========================================================================
// Update balance on one of the 3 accounts
// =========================================================================
export async function updateAccountBalanceAction(input: unknown): Promise<ActionResult> {
  const ctx = await resolveSessionWorkspace();
  if (!ctx.ok) return { ok: false, errorCode: ctx.errorCode };

  const rl = await rateLimit('mutation', `user:${ctx.user.id}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = accountBalanceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { error } = await ctx.supabase
    .from('accounts')
    .update({ balance: parsed.data.balance })
    .eq('workspace_id', ctx.workspaceId)
    .eq('kind', parsed.data.kind);

  if (error) return { ok: false, errorCode: 'errors.accounts.balanceUpdateFailed' };

  await logAuditEvent(
    AuditEvent.ACCOUNT_BALANCE_UPDATED,
    { userId: ctx.user.id, workspaceId: ctx.workspaceId },
    { resource_type: 'account', resource_id: parsed.data.kind },
  );

  revalidateAccountPaths();
  return { ok: true };
}

// =========================================================================
// Rename an account (purely cosmetic, keeps the fixed kind enum)
// =========================================================================
export async function renameAccountAction(input: unknown): Promise<ActionResult> {
  const ctx = await resolveSessionWorkspace();
  if (!ctx.ok) return { ok: false, errorCode: ctx.errorCode };

  const rl = await rateLimit('mutation', `user:${ctx.user.id}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = accountLabelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { error } = await ctx.supabase
    .from('accounts')
    .update({ label: parsed.data.label.trim() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('kind', parsed.data.kind);

  if (error) return { ok: false, errorCode: 'errors.accounts.renameFailed' };

  revalidateAccountPaths();
  return { ok: true };
}

// =========================================================================
// Update monthly income (workspaces.monthly_income)
// =========================================================================
export async function updateMonthlyIncomeAction(input: unknown): Promise<ActionResult> {
  const ctx = await resolveSessionWorkspace();
  if (!ctx.ok) return { ok: false, errorCode: ctx.errorCode };

  const rl = await rateLimit('mutation', `user:${ctx.user.id}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = monthlyIncomeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { error } = await ctx.supabase
    .from('workspaces')
    .update({ monthly_income: parsed.data.monthlyIncome })
    .eq('id', ctx.workspaceId);

  if (error) return { ok: false, errorCode: 'errors.accounts.incomeUpdateFailed' };

  await logAuditEvent(AuditEvent.WORKSPACE_UPDATED, {
    userId: ctx.user.id,
    workspaceId: ctx.workspaceId,
  });

  revalidateAccountPaths();
  return { ok: true };
}

// =========================================================================
// Update fixed monthly transfer Principal → Vie Courante
// =========================================================================
export async function updateVieCouranteTransferAction(input: unknown): Promise<ActionResult> {
  const ctx = await resolveSessionWorkspace();
  if (!ctx.ok) return { ok: false, errorCode: ctx.errorCode };

  const rl = await rateLimit('mutation', `user:${ctx.user.id}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = vieCouranteTransferSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { error } = await ctx.supabase
    .from('workspaces')
    .update({ vie_courante_monthly_transfer: parsed.data.amount })
    .eq('id', ctx.workspaceId);

  if (error) return { ok: false, errorCode: 'errors.accounts.transferUpdateFailed' };

  await logAuditEvent(AuditEvent.WORKSPACE_UPDATED, {
    userId: ctx.user.id,
    workspaceId: ctx.workspaceId,
  });

  revalidateAccountPaths();
  return { ok: true };
}
