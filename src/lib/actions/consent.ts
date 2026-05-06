'use server';

import { headers } from 'next/headers';

import { createClient } from '@/lib/supabase/server';
import { recordConsent, getConsents, ConsentScope } from '@/lib/gdpr/consent';
import { rateLimit } from '@/lib/security/rate-limit';
import { log } from '@/lib/log';
import type { ActionResult } from '@/lib/actions/types';
import {
  COOKIE_CONSENT_VERSION,
  type CookieConsentInput,
  type CookieConsentSnapshot,
} from '@/lib/actions/consent-types';

async function contextFromHeaders(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  return { ip, userAgent: h.get('user-agent') };
}

/**
 * Records cookie consent decisions for the authenticated user. For unauthenticated
 * visitors, returns `{ ok: true, persisted: false }` so the client can fall back
 * to localStorage-only mode without erroring.
 *
 * RGPD art. 7 — consent must be specific, informed, and granular. We persist the
 * analytics and marketing scopes independently so revocation of one does not
 * cascade to the other.
 */
export async function recordCookieConsentAction(
  input: CookieConsentInput,
): Promise<ActionResult<{ persisted: boolean }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: true, data: { persisted: false } };
  }

  const rl = await rateLimit('mutation', `consent:${user.id}`);
  if (!rl.success) {
    return { ok: false, errorCode: 'errors.session.rateLimited' };
  }

  const ctx = await contextFromHeaders();

  try {
    await recordConsent(
      user.id,
      ConsentScope.COOKIES_ANALYTICS,
      input.analytics,
      COOKIE_CONSENT_VERSION,
      { ipAddress: ctx.ip, userAgent: ctx.userAgent },
    );
    await recordConsent(
      user.id,
      ConsentScope.COOKIES_MARKETING,
      input.marketing,
      COOKIE_CONSENT_VERSION,
      { ipAddress: ctx.ip, userAgent: ctx.userAgent },
    );
  } catch (error) {
    log.warn('Failed to persist cookie consent', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { ok: false, errorCode: 'errors.generic' };
  }

  return { ok: true, data: { persisted: true } };
}

/**
 * Reads the current cookie consent snapshot for the authenticated user.
 * Returns `null` for unauthenticated visitors — the client should rely on
 * localStorage in that case.
 */
export async function getCookieConsentAction(): Promise<
  ActionResult<{ snapshot: CookieConsentSnapshot | null }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: true, data: { snapshot: null } };
  }

  try {
    const records = await getConsents(user.id);
    const analytics = records.find((r) => r.scope === ConsentScope.COOKIES_ANALYTICS);
    const marketing = records.find((r) => r.scope === ConsentScope.COOKIES_MARKETING);

    if (!analytics && !marketing) {
      return { ok: true, data: { snapshot: null } };
    }

    return {
      ok: true,
      data: {
        snapshot: {
          analytics: analytics?.granted ?? false,
          marketing: marketing?.granted ?? false,
          version: analytics?.version ?? marketing?.version ?? null,
          decidedAt: analytics?.grantedAt ?? analytics?.revokedAt ?? marketing?.grantedAt ?? null,
        },
      },
    };
  } catch (error) {
    log.warn('Failed to read cookie consent', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { ok: false, errorCode: 'errors.generic' };
  }
}

/**
 * Resets cookie consent decisions for the authenticated user by recording
 * `granted=false` on both analytics and marketing scopes. The client is then
 * responsible for clearing its localStorage so the banner re-prompts.
 *
 * RGPD art. 7(3) — withdrawing consent must be as easy as giving it.
 */
export async function resetCookieConsentAction(): Promise<ActionResult<{ persisted: boolean }>> {
  return recordCookieConsentAction({ analytics: false, marketing: false });
}
