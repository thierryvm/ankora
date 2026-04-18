'use server';

import { z } from 'zod';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { chargeFrequencySchema } from '@/lib/schemas/charge';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import type { ActionResult } from '@/lib/actions/types';

const onboardingSchema = z.object({
  workspaceName: z
    .string()
    .trim()
    .min(1, { message: 'onboarding.workspace.required' })
    .max(80, { message: 'onboarding.workspace.tooLong' }),
  monthlyIncome: z
    .number({ error: 'onboarding.income.invalid' })
    .finite({ message: 'onboarding.income.invalid' })
    .min(0, { message: 'onboarding.income.negative' })
    .max(10_000_000, { message: 'onboarding.income.tooHigh' }),
  firstCharge: z
    .object({
      label: z
        .string()
        .trim()
        .min(1, { message: 'onboarding.firstCharge.label.required' })
        .max(120, { message: 'onboarding.firstCharge.label.tooLong' }),
      amount: z
        .number({ error: 'onboarding.firstCharge.amount.invalid' })
        .finite({ message: 'onboarding.firstCharge.amount.invalid' })
        .min(0, { message: 'onboarding.firstCharge.amount.negative' })
        .max(1_000_000, { message: 'onboarding.firstCharge.amount.tooHigh' }),
      frequency: chargeFrequencySchema,
      dueMonth: z
        .number({ error: 'onboarding.firstCharge.dueMonth.range' })
        .int({ message: 'onboarding.firstCharge.dueMonth.range' })
        .min(1, { message: 'onboarding.firstCharge.dueMonth.range' })
        .max(12, { message: 'onboarding.firstCharge.dueMonth.range' }),
    })
    .nullable(),
});

export async function completeOnboardingAction(input: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, errorCode: 'errors.session.expired' };
  }

  const rl = await rateLimit('mutation', `user:${user.id}`);
  if (!rl.success) {
    return { ok: false, errorCode: 'errors.session.rateLimited' };
  }

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (wsError || !workspace) {
    return { ok: false, errorCode: 'errors.onboarding.workspaceNotFound' };
  }

  const { error: updateError } = await supabase
    .from('workspaces')
    .update({
      name: parsed.data.workspaceName,
      monthly_income: parsed.data.monthlyIncome,
    })
    .eq('id', workspace.id);

  if (updateError) {
    return { ok: false, errorCode: 'errors.onboarding.workspaceUpdateFailed' };
  }

  await logAuditEvent(AuditEvent.WORKSPACE_UPDATED, {
    userId: user.id,
    workspaceId: workspace.id,
  });

  if (parsed.data.firstCharge) {
    // Migration 20260417000004_three_accounts_model : paid_from NOT NULL.
    // Recurring charges default to the principal account.
    const { error: chargeError } = await supabase.from('charges').insert({
      workspace_id: workspace.id,
      created_by: user.id,
      label: parsed.data.firstCharge.label,
      amount: parsed.data.firstCharge.amount,
      frequency: parsed.data.firstCharge.frequency,
      due_month: parsed.data.firstCharge.dueMonth,
      category_id: null,
      is_active: true,
      paid_from: 'principal',
    });

    if (chargeError) {
      return { ok: false, errorCode: 'errors.onboarding.chargeFailed' };
    }

    await logAuditEvent(AuditEvent.CHARGE_CREATED, {
      userId: user.id,
      workspaceId: workspace.id,
    });
  }

  await supabase.from('users').update({ onboarded_at: new Date().toISOString() }).eq('id', user.id);

  redirect('/app');
}
