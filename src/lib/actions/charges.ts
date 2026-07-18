'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import { chargeInputSchema, chargeUpdateSchema } from '@/lib/schemas/charge';
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

  // Sort + de-dup payment_months if explicitly supplied; otherwise let the DB
  // default ([1..12]) take over for monthly charges.
  const sortedMonths =
    parsed.data.paymentMonths !== undefined
      ? Array.from(new Set(parsed.data.paymentMonths)).sort((a, b) => a - b)
      : undefined;

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
    ...(sortedMonths !== undefined && { payment_months: sortedMonths }),
    ...(parsed.data.paymentDay !== undefined && { payment_day: parsed.data.paymentDay }),
    ...(parsed.data.sortOrder !== undefined && { sort_order: parsed.data.sortOrder }),
    ...(parsed.data.paidFrom !== undefined && { paid_from: parsed.data.paidFrom }),
  });

  if (error) return { ok: false, errorCode: 'errors.charges.createFailed' };

  await logAuditEvent(AuditEvent.CHARGE_CREATED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidateDashboard();
  revalidateAppPath('charges');
  return { ok: true };
}

export async function updateChargeAction(id: string, input: unknown): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) {
    return { ok: false, errorCode: 'errors.validation.generic' };
  }

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

  // When `paymentMonths` is supplied, sort + de-dup AND mirror the first entry
  // into the legacy `due_month` column so the snapshot reads stay coherent
  // until PR-CLEANUP-LEGACY drops `due_month` (per @cowork validation 2026-05-07).
  const sortedMonths =
    parsed.data.paymentMonths !== undefined
      ? Array.from(new Set(parsed.data.paymentMonths)).sort((a, b) => a - b)
      : undefined;
  const mirroredDueMonth =
    parsed.data.paymentMonths !== undefined && sortedMonths && sortedMonths.length > 0
      ? sortedMonths[0]
      : parsed.data.dueMonth;

  const supabase = await createClient();
  const { error } = await supabase
    .from('charges')
    .update({
      ...(parsed.data.label !== undefined && { label: parsed.data.label }),
      ...(parsed.data.amount !== undefined && { amount: parsed.data.amount }),
      ...(parsed.data.frequency !== undefined && { frequency: parsed.data.frequency }),
      ...(mirroredDueMonth !== undefined && { due_month: mirroredDueMonth }),
      ...(sortedMonths !== undefined && { payment_months: sortedMonths }),
      ...(parsed.data.paymentDay !== undefined && { payment_day: parsed.data.paymentDay }),
      ...(parsed.data.sortOrder !== undefined && { sort_order: parsed.data.sortOrder }),
      ...(parsed.data.categoryId !== undefined && { category_id: parsed.data.categoryId }),
      ...(parsed.data.isActive !== undefined && { is_active: parsed.data.isActive }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      ...(parsed.data.paidFrom !== undefined && { paid_from: parsed.data.paidFrom }),
    })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId);

  if (error) return { ok: false, errorCode: 'errors.charges.updateFailed' };

  await logAuditEvent(AuditEvent.CHARGE_UPDATED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidateDashboard();
  revalidateAppPath('charges');
  return { ok: true };
}

/**
 * Flip the manual "à surveiller" marker on a charge (THI-329 PR-C).
 *
 * Read-then-write toggle: the pre-fetch doubles as the workspace-ownership
 * check (RLS + explicit `workspace_id` filter — same belt-and-braces as
 * update/delete above). Last-write-wins on a concurrent double-tap, which is
 * acceptable for a boolean UI marker (the revalidated page reconciles).
 */
export async function toggleWatchAction(id: string): Promise<ActionResult<{ watched: boolean }>> {
  if (!uuidSchema.safeParse(id).success) {
    return { ok: false, errorCode: 'errors.validation.generic' };
  }

  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const supabase = await createClient();
  const { data: charge, error: readError } = await supabase
    .from('charges')
    .select('is_watched')
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle();

  if (readError || !charge) return { ok: false, errorCode: 'errors.charges.watchFailed' };

  const watched = !charge.is_watched;
  const { error } = await supabase
    .from('charges')
    .update({ is_watched: watched })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId);

  if (error) return { ok: false, errorCode: 'errors.charges.watchFailed' };

  await logAuditEvent(AuditEvent.CHARGE_WATCH_TOGGLED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidateDashboard();
  revalidateAppPath('charges');
  return { ok: true, data: { watched } };
}

export async function deleteChargeAction(id: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) {
    return { ok: false, errorCode: 'errors.validation.generic' };
  }

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

  revalidateDashboard();
  revalidateAppPath('charges');
  return { ok: true };
}
