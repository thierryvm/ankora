'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { revalidateAppPath } from '@/lib/actions/revalidate';
import {
  profileUpdateSchema,
  mfaVerifySchema,
  makeDeletionRequestSchema,
  factorIdSchema,
} from '@/lib/schemas/settings';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import { exportUserData } from '@/lib/gdpr/export';
import { requestDeletion, cancelDeletion } from '@/lib/gdpr/deletion';
import { log } from '@/lib/log';
import type { ActionResult } from '@/lib/actions/types';

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
  if (!user) throw new Error('Session expired.');
  return { supabase, user };
}

// =========================================================================
// Profile
// =========================================================================
export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const { supabase, user } = await requireSessionUser();
  const rl = await rateLimit('mutation', `user:${user.id}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
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

  if (error) return { ok: false, errorCode: 'errors.settings.profileUpdateFailed' };

  revalidateAppPath('settings');
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
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (error || !data) {
    log.error('MFA enrollment failed', { error_code: error?.code ?? 'unknown' });
    return { ok: false, errorCode: 'errors.auth.mfaEnrollFailed' };
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
      errorCode: 'errors.auth.mfaCodeInvalid',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: parsed.data.factorId,
  });
  if (challengeError || !challenge) {
    return { ok: false, errorCode: 'errors.auth.mfaChallengeFailed' };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: parsed.data.factorId,
    challengeId: challenge.id,
    code: parsed.data.code,
  });

  if (verifyError) {
    return { ok: false, errorCode: 'errors.auth.mfaCodeInvalid' };
  }

  await logAuditEvent(AuditEvent.AUTH_MFA_ENABLED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  revalidateAppPath('settings');
  return { ok: true };
}

export async function unenrollMfaAction(factorId: string): Promise<ActionResult> {
  const { supabase, user } = await requireSessionUser();
  const { ip, userAgent } = await contextFromHeaders();

  const parsed = factorIdSchema.safeParse(factorId);
  if (!parsed.success) return { ok: false, errorCode: 'errors.validation.generic' };

  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data });
  if (error) {
    log.error('MFA unenroll failed', { error_code: error.code ?? 'unknown' });
    return { ok: false, errorCode: 'errors.auth.mfaDisableFailed' };
  }

  await logAuditEvent(AuditEvent.AUTH_MFA_DISABLED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  revalidateAppPath('settings');
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
    return { ok: false, errorCode: 'errors.settings.exportLimited' };
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
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  if (!user.email) {
    log.error('User email missing for deletion request', { user_id: user.id });
    return { ok: false, errorCode: 'errors.settings.deletionRequestFailed' };
  }

  const parsed = makeDeletionRequestSchema(user.email).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await requestDeletion(user.id, parsed.data.reason);
  } catch {
    return { ok: false, errorCode: 'errors.settings.deletionRequestFailed' };
  }

  await logAuditEvent(AuditEvent.GDPR_DELETION_REQUESTED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  revalidateAppPath('settings');
  revalidateAppPath('settings/deletion-status');
  return { ok: true };
}

export async function cancelAccountDeletionAction(): Promise<ActionResult> {
  const { user } = await requireSessionUser();
  const { ip, userAgent } = await contextFromHeaders();
  const rl = await rateLimit('mutation', `user:${user.id}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  try {
    await cancelDeletion(user.id);
  } catch {
    return { ok: false, errorCode: 'errors.settings.deletionCancelFailed' };
  }

  await logAuditEvent(AuditEvent.GDPR_DELETION_CANCELLED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  revalidateAppPath('settings');
  revalidateAppPath('settings/deletion-status');
  return { ok: true };
}

export async function logoutAndRedirect(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
