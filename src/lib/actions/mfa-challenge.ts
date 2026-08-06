'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import { log } from '@/lib/log';
import type { ActionResult } from '@/lib/actions/types';

/**
 * The sign-in second-factor challenge.
 *
 * Deliberately NOT `verifyMfaAction` from `settings.ts`. That one writes
 * `AUTH_MFA_ENABLED` on success — correct when a factor is being activated,
 * false on every subsequent sign-in. Reusing it would have filled the trail
 * with "MFA activé" lines and destroyed the one signal worth having.
 *
 * The factor is resolved HERE, from the session's own user. `mfaVerifySchema`
 * takes a `factorId` from the client, which suits the settings screen — the
 * visitor is picking among factors they already own, at aal2. At sign-in the
 * caller is at aal1 and the id must not be an input.
 */
const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export async function verifierDefiMfaAction(input: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session at all: nothing to elevate. The page guard sends anonymous
  // visitors to /login, so reaching this means the session died mid-challenge.
  if (!user) return { ok: false, errorCode: 'errors.session.expired' };

  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  const userAgent = h.get('user-agent');

  // Keyed by user, not by IP: a household shares one address, and one person
  // fumbling their code must not lock the others out. Fails CLOSED in
  // production — an Upstash outage blocks the challenge rather than skipping it.
  const rl = await rateLimit('mfa', `user:${user.id}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorCode: 'errors.auth.mfaCodeInvalid' };
  }

  const facteur = (user.factors ?? []).find((f) => f.status === 'verified');
  if (!facteur) {
    // Reached only if the factor vanished between the page render and the
    // submit. Nothing to verify, and nothing to blame the visitor for.
    log.warn('MFA challenge without a verified factor');
    return { ok: false, errorCode: 'errors.auth.mfaChallengeFailed' };
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: facteur.id,
  });
  if (challengeError || !challenge) {
    log.error('MFA challenge creation failed', { error_code: challengeError?.code ?? 'unknown' });
    return { ok: false, errorCode: 'errors.auth.mfaChallengeFailed' };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: facteur.id,
    challengeId: challenge.id,
    code: parsed.data.code,
  });

  if (verifyError) {
    // Recorded on its own event: a burst of these on one account is the signal
    // that someone holds the password and is working on the code.
    await logAuditEvent(AuditEvent.AUTH_MFA_CHALLENGE_FAILED, {
      userId: user.id,
      ipAddress: ip,
      userAgent,
    });
    return { ok: false, errorCode: 'errors.auth.mfaCodeInvalid' };
  }

  await logAuditEvent(AuditEvent.AUTH_MFA_CHALLENGE_PASSED, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  return { ok: true };
}
