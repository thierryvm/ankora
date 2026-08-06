'use server';

import Decimal from 'decimal.js';
import { z } from 'zod';

import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import { todayInAnkoraTz } from '@/lib/date/tz';
import { commitmentRowToDomain } from '@/lib/data/commitment-row';
import { getCommitmentsWithLedger } from '@/lib/data/commitments';
import { paymentKey, type CockpitCharge, type PaymentLedger } from '@/lib/domain/cockpit/types';
import {
  ciblesDuGesteGroupe,
  echeancesPassees,
  gesteGroupePour,
  obligationsDuMois,
  type NamedCommitment,
} from '@/lib/domain/obligations';
import { createClient } from '@/lib/supabase/server';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import type { ActionResult } from '@/lib/actions/types';
import type { GesteGroupeResult } from '@/lib/actions/obligations.types';
import { MFA_REQUISE, elevationDue } from '@/lib/auth/require-elevated';

/** Same contract as `charges.ts` / `commitments.ts`. */
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

const periodSchema = z.object({
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
});

/**
 * « Marquer les échéances passées comme payées » — and undo it.
 *
 * ## One gesture, and the same gesture undoes it
 *
 * @thierry has 14 monthly charges and Ankora asks for 14 taps. This is one.
 * Pressing it again when everything past is already ticked unticks exactly
 * those rows — no confirmation dialog in front of a reversible action, and no
 * second button the user has to find.
 *
 * The direction is DERIVED from the current state (`gesteGroupePour`), never
 * passed in by the client: a stale tab that thinks the month is unticked cannot
 * make this action wipe a ledger.
 *
 * ## Charges and instalments in the same press
 *
 * The month's obligations are one list (`obligationsDuMois`), so the bulk
 * gesture acts on both families. A commitment instalment is ticked exactly like
 * a bill — it is the same `commitment_payments` row `toggleCommitmentPaymentAction`
 * writes, so the two paths can never disagree about what "paid" means.
 *
 * ## Why writes go row by row rather than in one statement
 *
 * The two ledgers are separate tables with separate unique keys, and PostgREST
 * has no cross-table transaction here. Inserts are batched per table (one call
 * each) and the wall clock is read server-side. A partial failure leaves ticks
 * that the same button can undo — which is exactly the property that makes a
 * bulk write acceptable in the first place.
 */
export async function togglePastDueObligationsAction(
  input: unknown,
): Promise<ActionResult<GesteGroupeResult>> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errorCode: 'errors.validation.generic' };
  const ref = { year: parsed.data.periodYear, month: parsed.data.periodMonth };

  const supabase = await createClient();

  const [chargesRes, chargePaymentsRes, ledger] = await Promise.all([
    supabase.from('charges').select('*').eq('workspace_id', ctx.workspaceId),
    supabase
      .from('charge_payments')
      .select('id, charge_id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('period_year', ref.year)
      .eq('period_month', ref.month),
    getCommitmentsWithLedger(ctx.workspaceId),
  ]);

  if (chargesRes.error || chargePaymentsRes.error) {
    return { ok: false, errorCode: 'errors.charges.payments.toggleFailed' };
  }

  const charges: CockpitCharge[] = (chargesRes.data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    amount: new Decimal(Number(c.amount)),
    frequency: c.frequency as CockpitCharge['frequency'],
    paymentMonths: (c.payment_months ?? []) as readonly number[],
    paymentDay: c.payment_day,
    isActive: c.is_active,
  }));

  const paidRowIdByChargeId = new Map(
    (chargePaymentsRes.data ?? []).map((p) => [p.charge_id, p.id] as const),
  );
  const chargePayments: PaymentLedger = new Map(
    [...paidRowIdByChargeId.keys()].map((id) => [paymentKey(id, ref.year, ref.month), true]),
  );

  const commitments: NamedCommitment[] = ledger.commitments.map((c) => ({
    ...commitmentRowToDomain(c),
    label: c.label,
  }));
  const paidKeysByCommitment = new Map(
    Object.entries(ledger.paidKeysByCommitment).map(([id, keys]) => [id, new Set(keys)] as const),
  );

  const obligations = obligationsDuMois({
    charges,
    chargePayments,
    commitments,
    paidKeysByCommitment,
    ref,
  });
  const passees = echeancesPassees(obligations, ref, todayInAnkoraTz());
  const mode = gesteGroupePour(passees);
  if (mode === 'rien') return { ok: true, data: { mode, charges: 0, commitments: 0 } };

  const cibles = ciblesDuGesteGroupe(passees);
  const chargeTargets = cibles.filter((o) => o.source === 'charge');
  const commitmentTargets = cibles.filter((o) => o.source === 'commitment');

  if (mode === 'depointer') {
    const [c1, c2] = await Promise.all([
      chargeTargets.length === 0
        ? { error: null }
        : supabase
            .from('charge_payments')
            .delete()
            .eq('workspace_id', ctx.workspaceId)
            .eq('period_year', ref.year)
            .eq('period_month', ref.month)
            .in(
              'charge_id',
              chargeTargets.map((o) => o.id),
            ),
      commitmentTargets.length === 0
        ? { error: null }
        : supabase
            .from('commitment_payments')
            .delete()
            .eq('workspace_id', ctx.workspaceId)
            .eq('period_year', ref.year)
            .eq('period_month', ref.month)
            .in(
              'commitment_id',
              commitmentTargets.map((o) => o.id),
            ),
    ]);
    if (c1.error || c2.error) {
      return { ok: false, errorCode: 'errors.charges.payments.toggleFailed' };
    }
  } else {
    const [c1, c2] = await Promise.all([
      chargeTargets.length === 0
        ? { error: null }
        : supabase.from('charge_payments').insert(
            chargeTargets.map((o) => ({
              charge_id: o.id,
              workspace_id: ctx.workspaceId,
              period_year: ref.year,
              period_month: ref.month,
              // The amount is read from the obligation the SERVER derived, never
              // from the client — same rule as the single-row toggles.
              paid_amount: o.amountDue.toNumber(),
              created_by: ctx.userId,
            })),
          ),
      commitmentTargets.length === 0
        ? { error: null }
        : supabase.from('commitment_payments').insert(
            commitmentTargets.map((o) => ({
              commitment_id: o.id,
              workspace_id: ctx.workspaceId,
              period_year: ref.year,
              period_month: ref.month,
              paid_amount: o.amountDue.toNumber(),
              created_by: ctx.userId,
            })),
          ),
    ]);
    if (c1.error || c2.error) {
      return { ok: false, errorCode: 'errors.charges.payments.toggleFailed' };
    }
  }

  await logAuditEvent(
    AuditEvent.CHARGE_PAYMENT_TOGGLED,
    { userId: ctx.userId, workspaceId: ctx.workspaceId },
    {
      period_year: ref.year,
      period_month: ref.month,
      bulk: mode,
      charges: chargeTargets.length,
      commitments: commitmentTargets.length,
    },
  );

  revalidateDashboard();
  revalidateAppPath('charges');
  revalidateAppPath('commitments');
  return {
    ok: true,
    data: { mode, charges: chargeTargets.length, commitments: commitmentTargets.length },
  };
}
