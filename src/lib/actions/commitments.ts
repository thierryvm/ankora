'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import { commitmentInputSchema, commitmentUpdateSchema } from '@/lib/schemas/commitment';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import type { ActionResult } from '@/lib/actions/types';

const uuidSchema = z.string().uuid();

/** Same contract as `charges.ts`: first owner/editor membership, or an error code. */
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

function revalidateCommitments(): void {
  revalidateDashboard();
  revalidateAppPath('commitments');
}

export async function createCommitmentAction(input: unknown): Promise<ActionResult> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = commitmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('commitments').insert({
    workspace_id: ctx.workspaceId,
    created_by: ctx.userId,
    label: parsed.data.label,
    kind: parsed.data.kind,
    total_amount: parsed.data.totalAmount,
    installment_amount: parsed.data.installmentAmount ?? null,
    installments_total: parsed.data.installmentsTotal,
    start_year: parsed.data.startYear,
    start_month: parsed.data.startMonth,
    payment_day: parsed.data.paymentDay,
    frequency: parsed.data.frequency,
    category_id: parsed.data.categoryId,
    notes: parsed.data.notes,
    is_active: parsed.data.isActive,
  });

  if (error) return { ok: false, errorCode: 'errors.commitments.createFailed' };

  await logAuditEvent(AuditEvent.COMMITMENT_CREATED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidateCommitments();
  return { ok: true };
}

export async function updateCommitmentAction(id: string, input: unknown): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) {
    return { ok: false, errorCode: 'errors.validation.generic' };
  }

  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = commitmentUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from('commitments')
    .update({
      ...(d.label !== undefined && { label: d.label }),
      ...(d.kind !== undefined && { kind: d.kind }),
      ...(d.totalAmount !== undefined && { total_amount: d.totalAmount }),
      ...(d.installmentAmount !== undefined && { installment_amount: d.installmentAmount }),
      ...(d.installmentsTotal !== undefined && { installments_total: d.installmentsTotal }),
      ...(d.startYear !== undefined && { start_year: d.startYear }),
      ...(d.startMonth !== undefined && { start_month: d.startMonth }),
      ...(d.paymentDay !== undefined && { payment_day: d.paymentDay }),
      ...(d.frequency !== undefined && { frequency: d.frequency }),
      ...(d.categoryId !== undefined && { category_id: d.categoryId }),
      ...(d.notes !== undefined && { notes: d.notes }),
      ...(d.isActive !== undefined && { is_active: d.isActive }),
    })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId);

  if (error) return { ok: false, errorCode: 'errors.commitments.updateFailed' };

  await logAuditEvent(AuditEvent.COMMITMENT_UPDATED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidateCommitments();
  return { ok: true };
}

export async function deleteCommitmentAction(id: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) {
    return { ok: false, errorCode: 'errors.validation.generic' };
  }

  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('commitments')
    .delete()
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId);

  if (error) return { ok: false, errorCode: 'errors.commitments.deleteFailed' };

  await logAuditEvent(AuditEvent.COMMITMENT_DELETED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  revalidateCommitments();
  return { ok: true };
}

const togglePaymentSchema = z.object({
  commitmentId: z.string().uuid(),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
});

/**
 * Tick / untick ONE instalment for a period. Idempotent toggle (INSERT = paid,
 * DELETE = unpaid), mirroring `togglePaymentAction` for charges — the unique
 * (commitment_id, period_year, period_month) index makes a double-tap safe.
 * The instalment amount is read from the commitment, never trusted from the
 * client.
 */
export async function toggleCommitmentPaymentAction(
  input: unknown,
): Promise<ActionResult<{ paid: boolean }>> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = togglePaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errorCode: 'errors.validation.generic' };
  const { commitmentId, periodYear, periodMonth } = parsed.data;

  const supabase = await createClient();
  // Authz: the row must belong to the caller's workspace (RLS + explicit filter).
  const { data: commitment, error: readError } = await supabase
    .from('commitments')
    .select('total_amount, installment_amount, installments_total')
    .eq('id', commitmentId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle();

  if (readError || !commitment) {
    return { ok: false, errorCode: 'errors.commitments.payments.toggleFailed' };
  }

  const { data: existing } = await supabase
    .from('commitment_payments')
    .select('id')
    .eq('commitment_id', commitmentId)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('commitment_payments')
      .delete()
      .eq('id', existing.id)
      .eq('workspace_id', ctx.workspaceId);
    if (error) return { ok: false, errorCode: 'errors.commitments.payments.toggleFailed' };

    await logAuditEvent(AuditEvent.COMMITMENT_PAYMENT_TOGGLED, {
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
    });
    revalidateCommitments();
    return { ok: true, data: { paid: false } };
  }

  // A one-off owes its whole total at once (no instalment amount stored).
  const paidAmount = commitment.installment_amount ?? commitment.total_amount;
  const { error } = await supabase.from('commitment_payments').insert({
    commitment_id: commitmentId,
    workspace_id: ctx.workspaceId,
    period_year: periodYear,
    period_month: periodMonth,
    paid_amount: paidAmount,
    created_by: ctx.userId,
  });

  if (error) return { ok: false, errorCode: 'errors.commitments.payments.toggleFailed' };

  await logAuditEvent(AuditEvent.COMMITMENT_PAYMENT_TOGGLED, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  revalidateCommitments();
  return { ok: true, data: { paid: true } };
}
