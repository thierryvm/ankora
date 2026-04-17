'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { expenseInputSchema } from '@/lib/schemas/expense';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function authorizedWorkspace(): Promise<
  { ok: true; userId: string; workspaceId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expirée.' };

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'editor'])
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return { ok: false, error: 'Aucun workspace éditable.' };
  return { ok: true, userId: user.id, workspaceId: membership.workspace_id };
}

export async function createExpenseAction(input: unknown): Promise<ActionResult> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, error: 'Trop de requêtes.' };

  const parsed = expenseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides',
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

  if (error) return { ok: false, error: 'Impossible de créer la dépense.' };

  await logAuditEvent(AuditEvent.EXPENSE_CREATED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidatePath('/app');
  revalidatePath('/app/expenses');
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, error: 'Trop de requêtes.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId);

  if (error) return { ok: false, error: 'Impossible de supprimer.' };

  await logAuditEvent(AuditEvent.EXPENSE_DELETED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidatePath('/app');
  revalidatePath('/app/expenses');
  return { ok: true };
}
