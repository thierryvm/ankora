import { createClient } from '@/lib/supabase/server';
import { logAuditEvent, AuditEvent } from '@/lib/security/audit-log';

/**
 * Consent scopes — mirror the DB enum on user_consents.scope.
 * Kept granular so revocation of one scope doesn't cascade to others.
 */
export const ConsentScope = {
  TOS: 'tos',
  PRIVACY: 'privacy',
  COOKIES_ANALYTICS: 'cookies.analytics',
  COOKIES_MARKETING: 'cookies.marketing',
  NEWSLETTER: 'newsletter',
} as const;

export type ConsentScopeType = (typeof ConsentScope)[keyof typeof ConsentScope];

export type ConsentRecord = {
  scope: ConsentScopeType;
  granted: boolean;
  version: string;
  grantedAt: string | null;
  revokedAt: string | null;
};

export async function recordConsent(
  userId: string,
  scope: ConsentScopeType,
  granted: boolean,
  version: string,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from('user_consents').upsert(
    {
      user_id: userId,
      scope,
      granted,
      version,
      granted_at: granted ? now : null,
      revoked_at: granted ? null : now,
      ip_address: context.ipAddress ?? null,
      user_agent: context.userAgent?.slice(0, 256) ?? null,
    },
    { onConflict: 'user_id,scope' },
  );

  if (error) throw new Error(`Failed to record consent: ${error.message}`);

  await logAuditEvent(
    granted ? AuditEvent.GDPR_CONSENT_GIVEN : AuditEvent.GDPR_CONSENT_REVOKED,
    { userId, ipAddress: context.ipAddress, userAgent: context.userAgent },
    { resource_type: 'consent', reason: scope },
  );
}

export async function getConsents(userId: string): Promise<ConsentRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_consents')
    .select('scope, granted, version, granted_at, revoked_at')
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to read consents: ${error.message}`);

  return (data ?? []).map((row) => ({
    scope: row.scope as ConsentScopeType,
    granted: Boolean(row.granted),
    version: String(row.version),
    grantedAt: row.granted_at as string | null,
    revokedAt: row.revoked_at as string | null,
  }));
}
