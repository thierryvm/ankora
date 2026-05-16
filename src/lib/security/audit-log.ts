import { createAdminClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';

/**
 * Audit events — append-only. Drives GDPR accountability + security investigations.
 *
 * Note (PR-SEC-ADMIN 2026-05-10): the underlying `audit_log.event_type` column
 * is `text` without a check constraint, so adding new events here does NOT
 * require a DB migration. Names follow the `domain.action[_qualifier]` dot
 * convention so existing index `audit_log_event_idx` stays effective.
 */
export const AuditEvent = {
  // Authentication
  AUTH_SIGNUP: 'auth.signup',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  AUTH_MFA_ENABLED: 'auth.mfa_enabled',
  AUTH_MFA_DISABLED: 'auth.mfa_disabled',
  AUTH_RATE_LIMITED: 'auth.rate_limited',

  // Workspace
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_UPDATED: 'workspace.updated',
  WORKSPACE_DELETED: 'workspace.deleted',

  // Financial data
  CHARGE_CREATED: 'charge.created',
  CHARGE_UPDATED: 'charge.updated',
  CHARGE_DELETED: 'charge.deleted',
  CHARGE_PAYMENT_TOGGLED: 'charge.payment_toggled',
  EXPENSE_CREATED: 'expense.created',
  EXPENSE_UPDATED: 'expense.updated',
  EXPENSE_DELETED: 'expense.deleted',
  ACCOUNT_BALANCE_UPDATED: 'account.balance_updated',
  ACCOUNT_RENAMED: 'account.renamed',

  // GDPR
  GDPR_CONSENT_GIVEN: 'gdpr.consent_given',
  GDPR_CONSENT_REVOKED: 'gdpr.consent_revoked',
  GDPR_EXPORT_REQUESTED: 'gdpr.export_requested',
  GDPR_EXPORT_COMPLETED: 'gdpr.export_completed',
  GDPR_DELETION_REQUESTED: 'gdpr.deletion_requested',
  GDPR_DELETION_CANCELLED: 'gdpr.deletion_cancelled',
  GDPR_DELETION_COMPLETED: 'gdpr.deletion_completed',

  // Admin RBAC (PR-SEC-ADMIN 2026-05-10)
  ADMIN_ACCESS_GRANTED: 'admin.access.granted',
  ADMIN_ACCESS_DENIED: 'admin.access.denied',
  ADMIN_ACCESS_RATE_LIMITED: 'admin.access.rate_limited',
} as const;

export type AuditEventType = (typeof AuditEvent)[keyof typeof AuditEvent];

export type AuditContext = {
  userId: string | null;
  workspaceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Sanitize metadata before persisting — no PII, no secrets, no payload bodies.
 * Whitelist-only: reject any key not known to be safe.
 */
const SAFE_METADATA_KEYS = new Set([
  'resource_id',
  'resource_type',
  'previous_state',
  'new_state',
  'reason',
  'count',
  'duration_ms',
  'error_code',
  // PR-D4 Phase 1 — charge payment toggle traceability (no PII, no amounts).
  // `paid` is the boolean outcome; `period_year` / `period_month` are the
  // schedule slot. We deliberately exclude `paid_amount` from audit metadata
  // because amounts are PII-adjacent in financial software.
  'period_year',
  'period_month',
  'paid',
  // PR-SEC-ADMIN — admin route access traceability. `path` = pathname
  // requested (no query string, sub-routes future-proof via proxy.ts
  // x-pathname header). No email, no role, no session token.
  //
  // Note: `attempted_user_id` was initially whitelisted but removed after
  // security-auditor P1-B + gdpr-compliance-auditor P1 — redundant with
  // canonical `audit_log.user_id` column AND would survive deletion
  // pseudonymization (jsonb not cascaded by ON DELETE SET NULL).
  'path',
]);

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (typeof value === 'string' && value.length > 256) continue;
    clean[key] = value;
  }
  return clean;
}

export async function logAuditEvent(
  event: AuditEventType,
  context: AuditContext,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase.from('audit_log').insert({
    event_type: event,
    user_id: context.userId,
    workspace_id: context.workspaceId ?? null,
    ip_address: context.ipAddress ?? null,
    user_agent: context.userAgent?.slice(0, 256) ?? null,
    metadata: sanitizeMetadata(metadata) as never,
  });

  if (error) {
    // Never throw from audit logging — log to stderr but do not break caller flow.
    log.error('Audit event persistence failed', { event, error_message: error.message });
  }
}
