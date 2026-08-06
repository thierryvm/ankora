'use server';

import { z } from 'zod';

import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import { todayInAnkoraTz } from '@/lib/date/tz';
import { nextDueDateForCharge } from '@/lib/domain/charges';
import {
  confronterPortes,
  type CommitmentFrequency,
  type PorteHorizon,
} from '@/lib/domain/commitments';
import { createClient } from '@/lib/supabase/server';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import type { ActionResult } from '@/lib/actions/types';
import type { ConversionResult } from '@/lib/actions/charge-conversion.types';
import { MFA_REQUISE, elevationDue } from '@/lib/auth/require-elevated';

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

/**
 * The three doors, as they cross the wire. All optional — the flow's whole
 * point is that ONE of them is enough, and that none of them is the contract,
 * the rate or the original capital (none of which the model stores).
 */
const conversionSchema = z.object({
  chargeId: z.string().uuid(),
  dateDeFin: z
    .object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
    })
    .optional(),
  echeancesRestantes: z.number().int().min(1).max(600).optional(),
  soldeRestantDu: z.number().finite().positive().max(10_000_000).optional(),
});

/**
 * « Convertir cette charge en engagement » — the structural half of the fix.
 *
 * ## Why this exists at all
 *
 * The double count is not an arithmetic error: it is ONE obligation recorded in
 * TWO tables. Correcting it at read time would mean a permanent exclusion
 * filter inside the money math, driven by a resemblance — the disease, not the
 * cure. So the invariant is held at WRITE time: this action deactivates the
 * charge and creates the commitment in one move, after which
 * `totalChargesMensuelles` has nothing to exclude, because it only ever counted
 * active charges.
 *
 * ## Designed on the degraded case
 *
 * @thierry lost the Alpha Credit contract. He knows 250 €/month. That is the
 * NORMAL case — finding the paperwork for a running loan is rare — so the only
 * thing this action asks for is the horizon, through whichever of the three
 * doors the user can answer (`confronterPortes`). Everything else is derived
 * from the charge: label, payment day, cadence, and the anchor (its next due
 * date). Zero additional mandatory field.
 *
 * When several doors are filled, they are CONFRONTED: the result carries the
 * divergences so the UI can name them. Nothing is silently corrected.
 *
 * ## The ordering, and why the compensation runs the way it does
 *
 * PostgREST gives no cross-statement transaction here, so the two writes are
 * ordered by which failure is recoverable:
 *
 *   1. INSERT the commitment — if it fails, nothing has changed at all;
 *   2. UPDATE the charge to inactive — if THIS fails, the freshly created
 *      commitment is deleted and the action reports failure.
 *
 * The window between them is the only moment the obligation is counted twice,
 * and it closes on the next statement or on the compensating delete. The
 * reverse order would leave a window where the obligation is counted ZERO
 * times, which is the failure the user cannot see.
 *
 * A `SECURITY DEFINER` SQL function would make this atomic. The migration is
 * not written here on purpose: it could not be applied in this chantier (the
 * linked Supabase project is production), and shipping a feature that depends
 * on an unapplied migration is how a screen comes to fail silently.
 */
export async function convertChargeToCommitmentAction(
  input: unknown,
): Promise<ActionResult<ConversionResult>> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = conversionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errorCode: 'errors.validation.generic' };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: charge, error: readError } = await supabase
    .from('charges')
    .select('id, label, amount, frequency, payment_day, payment_months, category_id, is_active')
    .eq('id', d.chargeId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle();

  if (readError || !charge) return { ok: false, errorCode: 'errors.charges.notFound' };
  if (!charge.is_active) return { ok: false, errorCode: 'errors.conversion.chargeInactive' };

  const installmentAmount = Number(charge.amount);
  const frequency = charge.frequency as CommitmentFrequency;

  // Anchor = the charge's NEXT due date (locked decision D3: the anchor is the
  // next instalment, not the historical start). Derived server-side from the
  // Brussels wall clock — a client-supplied anchor would let a wrong device
  // clock shift an end date by a month.
  const nextDueIso = nextDueDateForCharge(
    {
      isActive: true,
      paymentMonths: (charge.payment_months ?? []) as readonly number[],
      paymentDay: charge.payment_day,
    },
    todayInAnkoraTz(),
  );
  if (!nextDueIso) return { ok: false, errorCode: 'errors.conversion.noSchedule' };
  const [anchorYear, anchorMonth] = nextDueIso.split('-').map(Number) as [number, number, number];

  const portes: PorteHorizon[] = [];
  if (d.echeancesRestantes !== undefined) {
    portes.push({ kind: 'echeancesRestantes', count: d.echeancesRestantes });
  }
  if (d.dateDeFin) {
    portes.push({ kind: 'dateDeFin', year: d.dateDeFin.year, month: d.dateDeFin.month });
  }
  if (d.soldeRestantDu !== undefined) {
    portes.push({ kind: 'soldeRestantDu', balance: d.soldeRestantDu });
  }

  const confrontation = confronterPortes(portes, {
    anchor: { year: anchorYear, month: anchorMonth },
    installmentAmount,
    frequency,
  });
  // No usable door: the charge stays a charge. Without an horizon the
  // conversion adds nothing — same smoothed effort, same monthly instalment,
  // and none of the countdown that justifies the move (§1.7).
  if (!confrontation) return { ok: false, errorCode: 'errors.conversion.horizonUnknown' };

  const { installmentsTotal } = confrontation;
  const totalAmount = Number((installmentsTotal * installmentAmount).toFixed(2));

  const { data: created, error: insertError } = await supabase
    .from('commitments')
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      label: charge.label,
      // A single remaining instalment is a one-off by the DB's own CHECK
      // (`commitments_one_off_single`); anything recurring is a debt.
      kind: installmentsTotal === 1 ? 'one_off' : 'debt',
      total_amount: totalAmount,
      installment_amount: installmentsTotal === 1 ? null : installmentAmount,
      installments_total: installmentsTotal,
      start_year: anchorYear,
      start_month: anchorMonth,
      payment_day: charge.payment_day,
      frequency,
      category_id: charge.category_id,
      notes: null,
      is_active: true,
    })
    .select('id')
    .single();

  if (insertError || !created) return { ok: false, errorCode: 'errors.commitments.createFailed' };

  const { error: deactivateError } = await supabase
    .from('charges')
    .update({ is_active: false })
    .eq('id', d.chargeId)
    .eq('workspace_id', ctx.workspaceId);

  if (deactivateError) {
    // Compensate: leaving the commitment behind would recreate the exact
    // double count this flow exists to close.
    await supabase
      .from('commitments')
      .delete()
      .eq('id', created.id)
      .eq('workspace_id', ctx.workspaceId);
    return { ok: false, errorCode: 'errors.conversion.failed' };
  }

  await logAuditEvent(
    AuditEvent.COMMITMENT_CREATED,
    { userId: ctx.userId, workspaceId: ctx.workspaceId },
    { converted_from_charge: true, installments_total: installmentsTotal },
  );

  const step = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[frequency];
  const endOrdinal = anchorYear * 12 + (anchorMonth - 1) + (installmentsTotal - 1) * step;

  revalidateDashboard();
  revalidateAppPath('charges');
  revalidateAppPath('commitments');

  return {
    ok: true,
    data: {
      commitmentId: created.id,
      installmentsTotal,
      totalAmount,
      porteRetenue: confrontation.porteRetenue,
      ecarts: confrontation.ecarts,
      endYear: Math.floor(endOrdinal / 12),
      endMonth: (endOrdinal % 12) + 1,
    },
  };
}
