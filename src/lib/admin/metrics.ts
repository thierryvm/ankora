import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  activeWorkspaces,
  brusselsDay,
  consentBreakdown,
  maskSmallCount,
  signupsByWeek,
  trailingWeeks,
  type ActiveWorkspaces,
  type ActivityRow,
  type ConsentBreakdown,
  type SmallCount,
  type WeeklySignups,
} from '@/lib/admin/aggregates';
import { countDeletionQueueAlertsWith } from '@/lib/gdpr/deletion-core';
import { log } from '@/lib/log';
import { AuditEvent } from '@/lib/security/audit-log';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';

/**
 * The admin panel's figures, v1 (audit of 1 October 2026, H6 §3.3): what the
 * database already knows, in aggregates only. Budget 0 €, no analytics table.
 *
 * ## Why the privileged client
 *
 * Every table read here carries row-level security scoped to its owner, so a
 * founder's own session would count only the founder. The service-role client
 * sees everything — which is exactly why the SHAPE of what leaves this module
 * is the safeguard: the return type holds numbers, week labels and fixed event
 * names, nothing else. Reads that bring rows back select only `created_at`,
 * `workspace_id`/`occurred_at` or `granted`; identifiers that transit (a
 * workspace id) are counted in memory and dropped. `requireAdmin()` on the
 * admin segment stays the only door.
 *
 * ## What v1 does not show
 *
 * - Failed password sign-ins: no audit event records them (only
 *   `auth.rate_limited`, which the security block counts).
 * - The last applied migration: `supabase_migrations` is not an exposed
 *   schema, so no API client can read it.
 *
 * A block that cannot be read is `null` (rendered « — »), never a zero and never
 * a broken page.
 */

export type AdminMetricsClient = SupabaseClient<Database>;

/** Writes that make a workspace « active ». Sign-ins, consents and admin events do not. */
export const WRITE_EVENTS = [
  AuditEvent.WORKSPACE_CREATED,
  AuditEvent.WORKSPACE_UPDATED,
  AuditEvent.WORKSPACE_RESTE_A_VIVRE_UPDATED,
  AuditEvent.CHARGE_CREATED,
  AuditEvent.CHARGE_UPDATED,
  AuditEvent.CHARGE_PAYMENT_TOGGLED,
  AuditEvent.CHARGE_PAYMENT_AMOUNT_FOLLOWED,
  AuditEvent.CHARGE_WATCH_TOGGLED,
  AuditEvent.COMMITMENT_CREATED,
  AuditEvent.COMMITMENT_UPDATED,
  AuditEvent.COMMITMENT_PAYMENT_TOGGLED,
  AuditEvent.CATEGORY_CREATED,
  AuditEvent.CATEGORY_MERGED,
  AuditEvent.EXPENSE_CREATED,
  AuditEvent.EXPENSE_UPDATED,
  AuditEvent.ACCOUNT_BALANCE_UPDATED,
  AuditEvent.ACCOUNT_RENAMED,
  AuditEvent.MOVEMENT_RECORDED,
  AuditEvent.MOVEMENT_CANCELLATION_SET,
] as const;

export const SECURITY_EVENTS = [
  AuditEvent.AUTH_MFA_CHALLENGE_FAILED,
  AuditEvent.AUTH_RATE_LIMITED,
  AuditEvent.ADMIN_ACCESS_DENIED,
  AuditEvent.ADMIN_ACCESS_RATE_LIMITED,
  // Not `admin.access.granted`: it counts the founder's own visits, one more
  // on every display of this very page.
] as const;

export type SecurityEvent = (typeof SECURITY_EVENTS)[number];

export type AdminMetrics = {
  users: { total: SmallCount; onboarded: SmallCount; weekly: WeeklySignups[] } | null;
  activity: ActiveWorkspaces | null;
  /** Last 7 days, one entry per event of `SECURITY_EVENTS`. */
  security: { event: SecurityEvent; count: SmallCount }[] | null;
  gdpr: {
    /**
     * Exact, unlike every other figure: each request is a legal deadline the
     * founder must act on, and the count carries no identity.
     */
    deletions: { stuck: number; nearBreach: number } | null;
    analyticsConsent: ConsentBreakdown | null;
  };
  /** Short SHA of the deployed build, or « local ». */
  build: string;
};

const WEEKS = 12;
const PAGE = 1000;
/** Past this many pages a read gives up rather than undercount. */
const MAX_PAGES = 20;
const DAY_MS = 86_400_000;

type Page<T> = { data: T[] | null; count: number | null; error: { message: string } | null };

/**
 * Every row of a paged read (`count: 'exact'` on each page), or an error —
 * never a silent truncation. A short page is NOT the end: the server's
 * `max_rows` may be lower than `PAGE`, so the read stops only once it holds the
 * row count the server announced, and refuses past `MAX_PAGES`.
 */
async function allPages<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = rows.length;
    const { data, error, count } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (expected === null) {
      if (count === null) throw new Error('row count unavailable');
      if (count > MAX_PAGES * PAGE) throw new Error(`more than ${MAX_PAGES * PAGE} rows`);
      expected = count;
    }
    rows.push(...(data ?? []));
    if (rows.length >= expected) return rows;
    if (!data || data.length === 0) throw new Error('read ended before the announced row count');
  }
  throw new Error(`more than ${MAX_PAGES * PAGE} rows`);
}

async function exactCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
) {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  // An absent count is « could not look », not zero.
  if (count === null) throw new Error('count unavailable');
  return count;
}

async function readUsers(client: AdminMetricsClient, now: Date) {
  const today = brusselsDay(now);
  // One day of margin before the first Monday: the Brussels bucketing below
  // drops whatever falls outside the window.
  const since = new Date(
    Date.parse(`${trailingWeeks(today, WEEKS)[0]}T00:00:00Z`) - DAY_MS,
  ).toISOString();
  const [total, onboarded, created] = await Promise.all([
    exactCount(client.from('users').select('created_at', { count: 'exact', head: true })),
    exactCount(
      client
        .from('users')
        .select('created_at', { count: 'exact', head: true })
        .not('onboarded_at', 'is', null),
    ),
    allPages<{ created_at: string }>((from, to) =>
      client
        .from('users')
        .select('created_at', { count: 'exact' })
        .gte('created_at', since)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
  ]);
  return {
    total: maskSmallCount(total),
    onboarded: maskSmallCount(onboarded),
    weekly: signupsByWeek(
      created.map((r) => r.created_at),
      today,
      WEEKS,
    ),
  };
}

async function readActivity(client: AdminMetricsClient, now: Date) {
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const rows = await allPages<ActivityRow>((from, to) =>
    client
      .from('audit_log')
      .select('workspace_id, occurred_at', { count: 'exact' })
      .in('event_type', [...WRITE_EVENTS])
      .gte('occurred_at', since)
      .order('id')
      .range(from, to),
  );
  return activeWorkspaces(
    rows.map((r) => ({ workspace_id: r.workspace_id, occurred_at: r.occurred_at })),
    now,
  );
}

async function readSecurity(client: AdminMetricsClient, now: Date) {
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  return Promise.all(
    SECURITY_EVENTS.map(async (event) => ({
      event,
      count: maskSmallCount(
        await exactCount(
          client
            .from('audit_log')
            .select('event_type', { count: 'exact', head: true })
            .eq('event_type', event)
            .gte('occurred_at', since),
        ),
      ),
    })),
  );
}

async function readConsent(client: AdminMetricsClient) {
  const analytics = (granted: boolean) =>
    exactCount(
      client
        .from('user_consents')
        .select('granted', { count: 'exact', head: true })
        .eq('scope', 'cookies.analytics')
        .eq('granted', granted),
    );
  const [total, granted, refused] = await Promise.all([
    exactCount(client.from('users').select('created_at', { count: 'exact', head: true })),
    analytics(true),
    analytics(false),
  ]);
  return consentBreakdown(total, granted, refused);
}

/** A block read on its own: its failure is logged and becomes `null`. */
async function block<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error: unknown) {
    log.error('Admin: failed to read a metrics block', {
      block: name,
      error_message: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

export function buildSha(sha: string | undefined): string {
  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : 'local';
}

export async function readAdminMetricsWith(
  client: AdminMetricsClient,
  now: Date,
  deployedSha: string | undefined,
): Promise<AdminMetrics> {
  const [users, activity, security, deletions, analyticsConsent] = await Promise.all([
    block('users', () => readUsers(client, now)),
    block('activity', () => readActivity(client, now)),
    block('security', () => readSecurity(client, now)),
    block('deletions', () => countDeletionQueueAlertsWith(client)),
    block('analytics_consent', () => readConsent(client)),
  ]);
  return {
    users,
    activity,
    security,
    gdpr: { deletions, analyticsConsent },
    build: buildSha(deployedSha),
  };
}

export function readAdminMetrics(): Promise<AdminMetrics> {
  return readAdminMetricsWith(
    createServiceRoleClient(),
    new Date(),
    process.env.VERCEL_GIT_COMMIT_SHA,
  );
}
