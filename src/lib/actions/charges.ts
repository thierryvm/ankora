'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import { isCategoryWritable } from '@/lib/actions/category-ownership';
import { chargeInputSchema, chargeUpdateSchema } from '@/lib/schemas/charge';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import type { ActionResult, ChargePaymentFollow } from '@/lib/actions/types';
import { MFA_REQUISE, elevationDue } from '@/lib/auth/require-elevated';
import { todayInAnkoraTz } from '@/lib/date/tz';

const uuidSchema = z.string().uuid();

async function authorizedWorkspace(): Promise<
  { ok: true; userId: string; workspaceId: string } | { ok: false; errorCode: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, errorCode: 'errors.session.expired' };

  // Second layer, and the one that protects the DATA. A Server Action is a POST
  // endpoint reachable without ever rendering the page that calls it, so the
  // page guard in `requireUser()` would leave every read and write open to a
  // session that never presented its second factor.
  if (await elevationDue(supabase, user)) return { ok: false, errorCode: MFA_REQUISE };

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
  if (!(await isCategoryWritable(supabase, ctx.workspaceId, parsed.data.categoryId, 'charge'))) {
    return { ok: false, errorCode: 'errors.validation.generic' };
  }
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

const toCents = (value: number | string) => Math.round(Number(value) * 100);

export async function updateChargeAction(
  id: string,
  input: unknown,
): Promise<ActionResult & { payment?: ChargePaymentFollow }> {
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
  if (!(await isCategoryWritable(supabase, ctx.workspaceId, parsed.data.categoryId, 'charge'))) {
    return { ok: false, errorCode: 'errors.validation.generic' };
  }

  // An amount change carries this month's payment along (see
  // ChargePaymentFollow). Both reads happen BEFORE any write: a read that
  // fails leaves the bill and its payment exactly as they were.
  const newAmount = parsed.data.amount;
  let previousAmount: number | null = null;
  let currentPayment: { id: string; paid_amount: number | string } | null = null;
  // The current period is Brussels' — a UTC date would file the 1st of the
  // month, before 2 a.m., under the previous month.
  const [periodYear, periodMonth] = todayInAnkoraTz().split('-').map(Number) as [number, number];

  if (newAmount !== undefined) {
    const { data: charge, error: chargeError } = await supabase
      .from('charges')
      .select('amount')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle();
    if (chargeError) return { ok: false, errorCode: 'errors.charges.updateFailed' };
    if (!charge) return { ok: false, errorCode: 'errors.charges.notFound' };
    previousAmount = Number(charge.amount);

    if (toCents(previousAmount) !== toCents(newAmount)) {
      // Only the current period is read; a past month is never rewritten.
      const { data: payment, error: paymentError } = await supabase
        .from('charge_payments')
        .select('id, paid_amount')
        .eq('charge_id', id)
        .eq('workspace_id', ctx.workspaceId)
        .eq('period_year', periodYear)
        .eq('period_month', periodMonth)
        .maybeSingle();
      if (paymentError) return { ok: false, errorCode: 'errors.charges.payments.readFailed' };
      currentPayment = payment;
    }
  }

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

  let payment: ChargePaymentFollow | undefined;
  if (currentPayment && previousAmount !== null && newAmount !== undefined) {
    if (toCents(currentPayment.paid_amount) !== toCents(previousAmount)) {
      // An amount typed by hand: it is what was paid, it stays.
      payment = {
        kind: 'kept',
        periodYear,
        periodMonth,
        paidAmount: Number(currentPayment.paid_amount),
      };
    } else {
      // Compare-and-set on the old amount: a payment edited meanwhile is not
      // overwritten, and a write that touches no row is not announced.
      const { data: followed, error: followError } = await supabase
        .from('charge_payments')
        .update({ paid_amount: newAmount })
        .eq('id', currentPayment.id)
        .eq('workspace_id', ctx.workspaceId)
        .eq('charge_id', id)
        .eq('period_year', periodYear)
        .eq('period_month', periodMonth)
        .eq('paid_amount', previousAmount)
        .select('id');
      if (followError || !followed || followed.length === 0) {
        payment = { kind: 'unchanged', periodYear, periodMonth, paidAmount: previousAmount };
      } else {
        await logAuditEvent(
          AuditEvent.CHARGE_PAYMENT_AMOUNT_FOLLOWED,
          { userId: ctx.userId, workspaceId: ctx.workspaceId },
          {
            resource_type: 'charge_payment',
            resource_id: currentPayment.id,
            period_year: periodYear,
            period_month: periodMonth,
          },
        );
        payment = { kind: 'followed', periodYear, periodMonth, paidAmount: newAmount };
      }
    }
  }

  revalidateDashboard();
  revalidateAppPath('charges');
  return payment ? { ok: true, payment } : { ok: true };
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
