'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { chargeFrequencySchema } from '@/lib/schemas/charge';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const onboardingSchema = z.object({
  workspaceName: z.string().trim().min(1, { message: 'Nom requis' }).max(80),
  monthlyIncome: z
    .number({ error: 'Revenu invalide' })
    .finite()
    .min(0, { message: 'Doit être ≥ 0' })
    .max(10_000_000),
  firstCharge: z
    .object({
      label: z.string().trim().min(1).max(120),
      amount: z.number().finite().min(0).max(1_000_000),
      frequency: chargeFrequencySchema,
      dueMonth: z.number().int().min(1).max(12),
    })
    .nullable(),
});

export async function completeOnboardingAction(input: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Session expirée. Reconnecte-toi.' };
  }

  const rl = await rateLimit('mutation', `user:${user.id}`);
  if (!rl.success) {
    return { ok: false, error: 'Trop de requêtes. Attends une minute.' };
  }

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides',
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
    return { ok: false, error: 'Workspace introuvable. Contacte le support.' };
  }

  const { error: updateError } = await supabase
    .from('workspaces')
    .update({
      name: parsed.data.workspaceName,
      monthly_income: parsed.data.monthlyIncome,
    })
    .eq('id', workspace.id);

  if (updateError) {
    return { ok: false, error: 'Impossible de mettre à jour le workspace.' };
  }

  await logAuditEvent(AuditEvent.WORKSPACE_UPDATED, {
    userId: user.id,
    workspaceId: workspace.id,
  });

  if (parsed.data.firstCharge) {
    const { error: chargeError } = await supabase.from('charges').insert({
      workspace_id: workspace.id,
      created_by: user.id,
      label: parsed.data.firstCharge.label,
      amount: parsed.data.firstCharge.amount,
      frequency: parsed.data.firstCharge.frequency,
      due_month: parsed.data.firstCharge.dueMonth,
      category_id: null,
      is_active: true,
    });

    if (chargeError) {
      return { ok: false, error: 'Workspace créé mais charge non enregistrée.' };
    }

    await logAuditEvent(AuditEvent.CHARGE_CREATED, {
      userId: user.id,
      workspaceId: workspace.id,
    });
  }

  await supabase.from('users').update({ onboarded_at: new Date().toISOString() }).eq('id', user.id);

  redirect('/app');
}
