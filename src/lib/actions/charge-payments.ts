'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import { chargePaymentToggleSchema } from '@/lib/schemas/charge-payment';
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

/**
 * Toggle a charge payment for a given (year, month) period:
 *   - if no row exists → INSERT (mark as paid)
 *   - if a row exists  → DELETE (mark as unpaid)
 *
 * Idempotence: the DB UNIQUE (charge_id, period_year, period_month) constraint
 * prevents double-INSERT. Concurrent toggles converge to the latest state.
 *
 * Authz: the charge must belong to the caller's workspace. We check this
 * BEFORE writing — never trust a `chargeId` from the client.
 *
 * Returns `{ paid: bool, paidAmount?: number }` so the UI can update its
 * optimistic state without re-fetching the snapshot.
 */
export async function togglePaymentAction(
  input: unknown,
): Promise<ActionResult<{ paid: boolean; paidAmount: number | null }>> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = chargePaymentToggleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { chargeId, periodYear, periodMonth, paidAmount, note } = parsed.data;

  const supabase = await createClient();

  // 1. Authz: confirm the charge exists in the caller's workspace.
  const { data: charge, error: chargeError } = await supabase
    .from('charges')
    .select('id, amount, workspace_id')
    .eq('id', chargeId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle();

  if (chargeError || !charge) {
    return { ok: false, errorCode: 'errors.charges.notFound' };
  }

  // 2. Look up an existing payment for this (charge, year, month).
  const { data: existing } = await supabase
    .from('charge_payments')
    .select('id')
    .eq('charge_id', chargeId)
    .eq('workspace_id', ctx.workspaceId)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .maybeSingle();

  let nextPaid: boolean;
  let nextAmount: number | null;

  if (existing) {
    // 3a. Toggle OFF — DELETE the row.
    const { error: deleteError } = await supabase
      .from('charge_payments')
      .delete()
      .eq('id', existing.id)
      .eq('workspace_id', ctx.workspaceId);
    if (deleteError) {
      return { ok: false, errorCode: 'errors.charges.payments.toggleFailed' };
    }
    nextPaid = false;
    nextAmount = null;
  } else {
    // 3b. Toggle ON — INSERT a new payment row.
    const amountToPersist = paidAmount ?? Number(charge.amount);
    const { error: insertError } = await supabase.from('charge_payments').insert({
      charge_id: chargeId,
      workspace_id: ctx.workspaceId,
      period_year: periodYear,
      period_month: periodMonth,
      paid_amount: amountToPersist,
      note: note ?? null,
      created_by: ctx.userId,
    });
    if (insertError) {
      return { ok: false, errorCode: 'errors.charges.payments.toggleFailed' };
    }
    nextPaid = true;
    nextAmount = amountToPersist;
  }

  await logAuditEvent(
    AuditEvent.CHARGE_PAYMENT_TOGGLED,
    {
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
    },
    {
      period_year: periodYear,
      period_month: periodMonth,
      paid: nextPaid,
    },
  );

  revalidateDashboard();
  revalidateAppPath('charges');
  return { ok: true, data: { paid: nextPaid, paidAmount: nextAmount } };
}
