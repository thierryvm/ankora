'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import { expenseInputSchema, expenseUpdateSchema } from '@/lib/schemas/expense';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import type { ActionResult } from '@/lib/actions/types';

const uuidSchema = z.string().uuid();

async function authorizedWorkspace(): Promise<
  { ok: true; userId: string; workspaceId: string } | { ok: false; errorCode: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, errorCode: 'errors.session.expired' };

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'editor'])
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return { ok: false, errorCode: 'errors.db.workspaceNotFound' };
  return { ok: true, userId: user.id, workspaceId: membership.workspace_id };
}

export async function createExpenseAction(input: unknown): Promise<ActionResult> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = expenseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('expenses').insert({
    workspace_id: ctx.workspaceId,
    created_by: ctx.userId,
    label: parsed.data.label,
    amount: parsed.data.amount,
    occurred_on: parsed.data.occurredOn,
    category_id: parsed.data.categoryId,
    note: parsed.data.note,
  });

  if (error) return { ok: false, errorCode: 'errors.expenses.createFailed' };

  await logAuditEvent(AuditEvent.EXPENSE_CREATED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidateDashboard();
  revalidateAppPath('expenses');
  return { ok: true };
}

export async function updateExpenseAction(id: string, input: unknown): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) {
    return { ok: false, errorCode: 'errors.validation.generic' };
  }

  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = expenseUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('expenses')
    .update({
      ...(parsed.data.label !== undefined && { label: parsed.data.label }),
      ...(parsed.data.amount !== undefined && { amount: parsed.data.amount }),
      ...(parsed.data.occurredOn !== undefined && { occurred_on: parsed.data.occurredOn }),
      ...(parsed.data.categoryId !== undefined && { category_id: parsed.data.categoryId }),
      ...(parsed.data.note !== undefined && { note: parsed.data.note }),
      ...(parsed.data.paidFrom !== undefined && { paid_from: parsed.data.paidFrom }),
    })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId);

  if (error) return { ok: false, errorCode: 'errors.expenses.updateFailed' };

  await logAuditEvent(AuditEvent.EXPENSE_UPDATED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidateDashboard();
  revalidateAppPath('expenses');
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) {
    return { ok: false, errorCode: 'errors.validation.generic' };
  }

  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId);

  if (error) return { ok: false, errorCode: 'errors.expenses.deleteFailed' };

  await logAuditEvent(AuditEvent.EXPENSE_DELETED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidateDashboard();
  revalidateAppPath('expenses');
  return { ok: true };
}
