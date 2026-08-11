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
import { elevationDue } from '@/lib/auth/require-elevated';
import { exportUserData } from '@/lib/gdpr/export';
import {
  requestDeletion,
  cancelDeletion,
  retryDeletion,
  type CancelDeletionResult,
  type RequestDeletionResult,
} from '@/lib/gdpr/deletion';
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

  // Second layer — see `charges.ts`. Throws rather than returning a code
  // because that is this helper's existing failure contract; changing it would
  // mean touching all seven call sites for no gain. Through the UI this is
  // unreachable anyway: the page guard sends an aal1 visitor to the challenge
  // before `/app/settings` ever renders. It bites on a direct POST, which is
  // exactly what it is for.
  //
  // No deadlock on enrolment: the predicate only refuses when a VERIFIED factor
  // already exists, so `enrollMfaAction` and `verifyMfaAction` stay reachable
  // for anyone activating 2FA for the first time.
  if (await elevationDue(supabase, user)) throw new Error('Second factor required.');

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
    // Display name only — the language preference is owned by `setLocaleAction`,
    // which also writes the cookie and revalidates the root layout.
    .update({ display_name: parsed.data.displayName })
    .eq('id', user.id);

  if (error) return { ok: false, errorCode: 'errors.settings.profileUpdateFailed' };

  revalidateAppPath('settings');
  return { ok: true };
}

// =========================================================================
// MFA (TOTP)
// =========================================================================

/**
 * Delete the factors left behind by enrolments that were never confirmed, and
 * return how many actually went.
 *
 * An `unverified` factor authenticated nobody: it is the residue of an attempt
 * abandoned by closing the tab, losing the network, or simply walking away —
 * none of which the browser can report. Only the server can clear it.
 *
 * Two guards keep this away from a factor that is actually protecting the
 * account, and the second is the one that matters. The status filter reads a
 * snapshot, so on its own it would lose a race against another tab confirming
 * an enrolment. GoTrue closes that race itself: it refuses to unenroll a
 * VERIFIED factor from an aal1 session. A factor promoted between the read and
 * the delete is therefore rejected server-side, and the live enrolment
 * survives.
 *
 * Deliberately NOT filtered by factor type: GoTrue's name-conflict check walks
 * every factor of the user whatever its type, so narrowing this to `totp`
 * would leave in place a collision this exists to clear.
 */
async function discardAbandonedFactors(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) {
    // Say so. An unreadable list yields an empty list, so without this line a
    // cleanup that never ran would be indistinguishable from one that found
    // nothing to do — and the caller would report a name conflict it had no
    // way to explain.
    log.warn('MFA factor list unreadable, cleanup skipped', {
      error_code: listError.code ?? 'unknown',
    });
    return 0;
  }

  let discarded = 0;
  for (const factor of (factors?.all ?? []).filter((f) => f.status === 'unverified')) {
    const { error: discardError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (discardError) {
      // Non-blocking: a failed cleanup must not replace one dead end with
      // another. The caller retries the enrolment and reports its own outcome.
      log.warn('MFA abandoned enrollment discard failed', {
        error_code: discardError.code ?? 'unknown',
      });
      continue;
    }
    discarded += 1;
  }
  return discarded;
}

export async function enrollMfaAction(): Promise<
  ActionResult<{ factorId: string; qr: string; secret: string }>
> {
  const { supabase, user } = await requireSessionUser();
  const { ip, userAgent } = await contextFromHeaders();
  const rl = await rateLimit('mutation', `user:${user.id}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  // Try first, clean up only if the conflict actually happens.
  //
  // We enroll without a `friendlyName`, so every factor this app creates
  // carries the same empty name — and GoTrue rejects an enrolment whose name
  // collides with an existing one (`mfa_factor_name_conflict`, backed by the
  // `mfa_factors_user_friendly_name_unique` index). One enrolment started and
  // never confirmed therefore blocked every later one, permanently: the screen
  // listed VERIFIED factors only, so it could neither show nor remove the row
  // doing the blocking.
  //
  // The cleanup is REACTIVE, not preventive, and that ordering is the security
  // property: a step that deletes factors runs only once the conflict has
  // proven it necessary, instead of on every click of « enable ». On the happy
  // path nothing is ever deleted.
  let { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });

  if (error?.code === 'mfa_factor_name_conflict') {
    const discarded = await discardAbandonedFactors(supabase);
    if (discarded > 0) {
      await logAuditEvent(
        AuditEvent.AUTH_MFA_ENROLLMENT_DISCARDED,
        { userId: user.id, ipAddress: ip, userAgent },
        { count: discarded },
      );
      // One retry, never a loop: if the name is still taken after the cleanup,
      // the blocker is a VERIFIED factor and deleting it is not this action's
      // call to make.
      ({ data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' }));
    }
  }

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

  // Same bucket as the sign-in challenge, and for the same reason: this also
  // checks a 6-digit code. Leaving one of the two unthrottled would have read
  // as an oversight the day someone compared them — and the only reason it was
  // survivable was that GoTrue keeps a limiter of its own, i.e. an assumption
  // about a component this repository does not version.
  const rl = await rateLimit('mfa', `user:${user.id}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

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

  // Read the status BEFORE removing it, so the trail can name what happened.
  //
  // This action used to write `AUTH_MFA_DISABLED` whatever it removed. That was
  // unreachable for an unverified factor while the screen listed verified ones
  // only — it no longer is, because the screen now hands out the ids of pending
  // enrolments so they can be resumed. Recording one of those as a disablement
  // would claim a protection was withdrawn that had never been in place, which
  // is the exact reason `AUTH_MFA_ENROLLMENT_DISCARDED` exists.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const removedWasVerified =
    (factors?.all ?? []).find((f) => f.id === parsed.data)?.status === 'verified';

  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data });
  if (error) {
    log.error('MFA unenroll failed', { error_code: error.code ?? 'unknown' });
    return { ok: false, errorCode: 'errors.auth.mfaDisableFailed' };
  }

  await logAuditEvent(
    removedWasVerified ? AuditEvent.AUTH_MFA_DISABLED : AuditEvent.AUTH_MFA_ENROLLMENT_DISCARDED,
    { userId: user.id, ipAddress: ip, userAgent },
    removedWasVerified ? undefined : { count: 1 },
  );

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
// GDPR — Account deletion (14-day grace, ADR-023)
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

  let requested: RequestDeletionResult;
  try {
    requested = await requestDeletion(user.id, parsed.data.reason);
  } catch {
    return { ok: false, errorCode: 'errors.settings.deletionRequestFailed' };
  }

  // The return value is CONSUMED, and that is the whole point of it being
  // discriminated. This call used to throw the result away: giving
  // `requestDeletion` a union type would have compiled without a word, and the
  // action would still have answered `ok: true` on a quarantined request —
  // the same "it says it worked and nothing happened" defect, moved one
  // function along. A Vitest pins this branch, because an end-to-end test would
  // pass by accident: the screen redirects either way.
  if (requested.kind === 'already_failed') {
    return { ok: false, errorCode: 'errors.settings.deletionAlreadyFailed' };
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

  let result: CancelDeletionResult;
  try {
    result = await cancelDeletion(user.id);
  } catch {
    return { ok: false, errorCode: 'errors.settings.deletionCancelFailed' };
  }

  // Past the point of no return: a run already owns this request and the GoTrue
  // call may already have gone out. Saying "cancelled" here would be the same
  // inexact statement (art. 12(1)) this step exists to remove.
  if (!result.cancelled && result.reason === 'in_progress') {
    return { ok: false, errorCode: 'errors.settings.deletionCancelTooLate' };
  }

  // `none` USED TO FALL THROUGH TO `ok: true`, and that was the defect: an
  // issue that moved no row presented itself as a success, so the button
  // announced "request cancelled" over a screen that still showed the request.
  // Nothing moved is never a success — whatever the reason.
  if (!result.cancelled) {
    revalidateAppPath('settings');
    revalidateAppPath('settings/deletion-status');
    return { ok: false, errorCode: 'errors.settings.deletionCancelNothing' };
  }

  // The audit row is emitted ONLY when a row actually moved. It used to fire
  // unconditionally, so a filter matching nothing still wrote a line asserting
  // a cancellation that never happened.
  await logAuditEvent(AuditEvent.GDPR_DELETION_CANCELLED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  revalidateAppPath('settings');
  revalidateAppPath('settings/deletion-status');
  return { ok: true };
}

/**
 * Relaunch an erasure that gave up — not a button more, the re-arming of an
 * irreversible destruction.
 *
 * It therefore carries the SAME guarantees as the gesture it re-arms: the
 * person types their own email address, the mutation is rate-limited, and an
 * audit row is written. *Cancel*, by contrast, stays a single click — an
 * undo never costs more than the action it undoes.
 */
export async function retryAccountDeletionAction(input: unknown): Promise<ActionResult> {
  const { user } = await requireSessionUser();
  const { ip, userAgent } = await contextFromHeaders();

  const rl = await rateLimit('mutation', `user:${user.id}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  if (!user.email) {
    log.error('User email missing for deletion retry', { user_id: user.id });
    return { ok: false, errorCode: 'errors.settings.deletionRetryFailed' };
  }

  // The same schema as the initial request. The screen shows two buttons with
  // opposite consequences and one of them destroys: a single click is not
  // enough of a gesture. The cost is one typed address.
  const parsed = makeDeletionRequestSchema(user.email).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  let result: Awaited<ReturnType<typeof retryDeletion>>;
  try {
    result = await retryDeletion(user.id);
  } catch {
    return { ok: false, errorCode: 'errors.settings.deletionRetryFailed' };
  }

  // Two tabs open, a claim in between, and the relaunch lands on a row that is
  // no longer `failed`. Same rule as cancellation: nothing moved is never a
  // success.
  if (!result.retried) {
    revalidateAppPath('settings');
    revalidateAppPath('settings/deletion-status');
    return { ok: false, errorCode: 'errors.settings.deletionRetryNothing' };
  }

  // Non-negotiable, and not for symmetry: `retryDeletion` just reset `attempts`
  // to 0, so the count of the previous cycle exists in this row and nowhere
  // else. Without it we would re-introduce, one level up, the very amnesia
  // ADR-042 exists to fix. No `resource_id` — the allow-list would take it, and
  // it would put the person's UUID beside a deletion event.
  await logAuditEvent(AuditEvent.GDPR_DELETION_RETRIED, {
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
