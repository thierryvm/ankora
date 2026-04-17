'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import {
  profileUpdateSchema,
  mfaVerifySchema,
  deletionRequestSchema,
  factorIdSchema,
} from '@/lib/schemas/settings';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import { exportUserData } from '@/lib/gdpr/export';
import { requestDeletion, cancelDeletion } from '@/lib/gdpr/deletion';

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function contextFromHeaders(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  return { ip, userAgent: h.get('user-agent') };
}

async function requireSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Session expirée.');
  return { supabase, user };
}

// =========================================================================
// Profile
// =========================================================================
export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const { supabase, user } = await requireSessionUser();
  const rl = await rateLimit('mutation', `user:${user.id}`);
  if (!rl.success) return { ok: false, error: 'Trop de requêtes.' };

  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { error } = await supabase
    .from('users')
    .update({
      display_name: parsed.data.displayName,
      locale: parsed.data.locale,
    })
    .eq('id', user.id);

  if (error) return { ok: false, error: 'Impossible de mettre à jour le profil.' };

  revalidatePath('/app/settings');
  return { ok: true };
}

// =========================================================================
// MFA (TOTP)
// =========================================================================
export async function enrollMfaAction(): Promise<
  ActionResult<{ factorId: string; qr: string; secret: string }>
> {
  const { supabase, user } = await requireSessionUser();
  const rl = await rateLimit('mutation', `user:${user.id}`);
  if (!rl.success) return { ok: false, error: 'Trop de requêtes.' };

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Impossible de démarrer l’enrôlement.' };
  }

  return {
    ok: true,
    data: {
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    },
  };
}

export async function verifyMfaAction(input: unknown): Promise<ActionResult> {
  const { supabase, user } = await requireSessionUser();
  const { ip, userAgent } = await contextFromHeaders();

  const parsed = mfaVerifySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Code invalide',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: parsed.data.factorId,
  });
  if (challengeError || !challenge) {
    return { ok: false, error: 'Challenge MFA impossible.' };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: parsed.data.factorId,
    challengeId: challenge.id,
    code: parsed.data.code,
  });

  if (verifyError) {
    return { ok: false, error: 'Code incorrect. Réessaie.' };
  }

  await logAuditEvent(AuditEvent.AUTH_MFA_ENABLED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  revalidatePath('/app/settings');
  return { ok: true };
}

export async function unenrollMfaAction(factorId: string): Promise<ActionResult> {
  const { supabase, user } = await requireSessionUser();
  const { ip, userAgent } = await contextFromHeaders();

  const parsed = factorIdSchema.safeParse(factorId);
  if (!parsed.success) return { ok: false, error: 'Identifiant invalide.' };

  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data });
  if (error) {
    console.error('[unenrollMfaAction]', error.code ?? 'unknown');
    return { ok: false, error: 'Impossible de désactiver la 2FA.' };
  }

  await logAuditEvent(AuditEvent.AUTH_MFA_DISABLED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  revalidatePath('/app/settings');
  return { ok: true };
}

// =========================================================================
// GDPR — Export
// =========================================================================
export async function exportMyDataAction(): Promise<
  ActionResult<{ filename: string; payload: string }>
> {
  const { user } = await requireSessionUser();
  const { ip, userAgent } = await contextFromHeaders();

  const rl = await rateLimit('export', `user:${user.id}`);
  if (!rl.success) {
    return { ok: false, error: 'Export limité à une fois toutes les 5 minutes.' };
  }

  await logAuditEvent(AuditEvent.GDPR_EXPORT_REQUESTED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  const bundle = await exportUserData(user.id);
  const filename = `ankora-export-${user.id.slice(0, 8)}-${Date.now()}.json`;

  return {
    ok: true,
    data: {
      filename,
      payload: JSON.stringify(bundle, null, 2),
    },
  };
}

// =========================================================================
// GDPR — Account deletion (30-day grace)
// =========================================================================
export async function requestAccountDeletionAction(input: unknown): Promise<ActionResult> {
  const { user } = await requireSessionUser();
  const { ip, userAgent } = await contextFromHeaders();

  const rl = await rateLimit('mutation', `user:${user.id}`);
  if (!rl.success) return { ok: false, error: 'Trop de requêtes.' };

  const parsed = deletionRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Confirmation invalide',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await requestDeletion(user.id, parsed.data.reason);
  } catch {
    return { ok: false, error: 'Impossible de programmer la suppression.' };
  }

  await logAuditEvent(AuditEvent.GDPR_DELETION_REQUESTED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  revalidatePath('/app/settings');
  revalidatePath('/app/settings/deletion-status');
  return { ok: true };
}

export async function cancelAccountDeletionAction(): Promise<ActionResult> {
  const { user } = await requireSessionUser();
  const { ip, userAgent } = await contextFromHeaders();
  const rl = await rateLimit('mutation', `user:${user.id}`);
  if (!rl.success) return { ok: false, error: 'Trop de requêtes.' };

  try {
    await cancelDeletion(user.id);
  } catch {
    return { ok: false, error: 'Impossible d’annuler la demande.' };
  }

  await logAuditEvent(AuditEvent.GDPR_DELETION_CANCELLED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  revalidatePath('/app/settings');
  revalidatePath('/app/settings/deletion-status');
  return { ok: true };
}

export async function logoutAndRedirect(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
