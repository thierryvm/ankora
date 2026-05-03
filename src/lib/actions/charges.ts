'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { chargeInputSchema, chargeUpdateSchema } from '@/lib/schemas/charge';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import type { ActionResult } from '@/lib/actions/types';

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

export async function createChargeAction(input: unknown): Promise<ActionResult> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = chargeInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('charges').insert({
    workspace_id: ctx.workspaceId,
    created_by: ctx.userId,
    label: parsed.data.label,
    amount: parsed.data.amount,
    frequency: parsed.data.frequency,
    due_month: parsed.data.dueMonth,
    category_id: parsed.data.categoryId,
    is_active: parsed.data.isActive,
    notes: parsed.data.notes ?? null,
  });

  if (error) return { ok: false, errorCode: 'errors.charges.createFailed' };

  await logAuditEvent(AuditEvent.CHARGE_CREATED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidatePath('/[locale]/app', 'page');
  revalidatePath('/[locale]/app/charges', 'page');
  return { ok: true };
}

export async function updateChargeAction(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = chargeUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('charges')
    .update({
      ...(parsed.data.label !== undefined && { label: parsed.data.label }),
      ...(parsed.data.amount !== undefined && { amount: parsed.data.amount }),
      ...(parsed.data.frequency !== undefined && { frequency: parsed.data.frequency }),
      ...(parsed.data.dueMonth !== undefined && { due_month: parsed.data.dueMonth }),
      ...(parsed.data.categoryId !== undefined && { category_id: parsed.data.categoryId }),
      ...(parsed.data.isActive !== undefined && { is_active: parsed.data.isActive }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
    })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId);

  if (error) return { ok: false, errorCode: 'errors.charges.updateFailed' };

  await logAuditEvent(AuditEvent.CHARGE_UPDATED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidatePath('/[locale]/app', 'page');
  revalidatePath('/[locale]/app/charges', 'page');
  return { ok: true };
}

export async function deleteChargeAction(id: string): Promise<ActionResult> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('charges')
    .delete()
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId);

  if (error) return { ok: false, errorCode: 'errors.charges.deleteFailed' };

  await logAuditEvent(AuditEvent.CHARGE_DELETED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidatePath('/[locale]/app', 'page');
  revalidatePath('/[locale]/app/charges', 'page');
  return { ok: true };
}
