import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { env } from '@/lib/env';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';

import { requireUser } from './require-user';

/**
 * Server-side guard for `/[locale]/admin/*` routes.
 *
 * Order of operations (each step is auditable):
 *   1. **Rate limit** (10 req/min/IP, kind `admin`). Applies even on
 *      unauthenticated requests so we choke scan volume before paying the
 *      Supabase auth round-trip. On exhaustion → `notFound()` (404) +
 *      audit event `admin.access.rate_limited`. We choose 404 over 429
 *      because Server Components cannot emit custom status codes directly;
 *      a future middleware-level rate limit can return proper 429 with
 *      `Retry-After`. The 404 also masks the route from automated scans.
 *   2. **Auth check** via `requireUser()` (redirects `/login` if no session).
 *   3. **Allow-list check** against `ANKORA_ADMIN_USER_IDS` (server-only env).
 *      On miss → audit `admin.access.denied` + redirect `/app` (logged-in
 *      non-admin lands on their dashboard, not a 404 that suggests the
 *      route is broken).
 *   4. **Granted** → audit `admin.access.granted` + return user.
 *
 * Audit logging is never blocking — `logAuditEvent` swallows DB errors so
 * a transient outage doesn't lock @thierry out of admin (cf. audit-log.ts:102).
 */

function extractClientIp(headersList: Headers): string {
  const forwarded = headersList.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? headersList.get('x-real-ip') ?? 'anon';
}

export async function requireAdmin(): Promise<User> {
  const headersList = await headers();
  const ipAddress = extractClientIp(headersList);
  const userAgent = headersList.get('user-agent');
  const path = headersList.get('x-pathname') ?? '/admin';

  // 1. Rate limit BEFORE auth (anti-scan choke point)
  const rl = await rateLimit('admin', `ip:${ipAddress}`);
  if (!rl.success) {
    await logAuditEvent(
      AuditEvent.ADMIN_ACCESS_RATE_LIMITED,
      { userId: null, ipAddress, userAgent },
      { path },
    );
    notFound();
  }

  // 2. Auth check (redirects /login on no session — handled by requireUser)
  const user = await requireUser();

  // 3. Admin allow-list check
  const rawIds = env.ANKORA_ADMIN_USER_IDS ?? '';
  const allowed = new Set(
    rawIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );

  if (!allowed.has(user.id)) {
    await logAuditEvent(
      AuditEvent.ADMIN_ACCESS_DENIED,
      { userId: user.id, ipAddress, userAgent },
      { path, attempted_user_id: user.id },
    );
    redirect('/app');
  }

  // 4. Granted
  await logAuditEvent(
    AuditEvent.ADMIN_ACCESS_GRANTED,
    { userId: user.id, ipAddress, userAgent },
    { path },
  );
  return user;
}
