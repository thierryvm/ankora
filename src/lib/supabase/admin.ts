import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

/**
 * Service-role Supabase client — deliberately cookie-free.
 *
 * The predecessor (`createAdminClient`, removed) built a `createServerClient`
 * from `@supabase/ssr` with the service_role key AND a cookie adapter. When a
 * session cookie was present, the SDK sent the caller's JWT as `Authorization`
 * instead of the service_role key, silently downgrading every query to the
 * `authenticated` role — which `audit_log` denies. Measured 2026-07-26: the
 * same key, same table, same database, INSERTED without cookies and
 * `42501 permission denied` with them. Tracked as H3, issue #192.
 *
 * Three things must never happen in this module:
 *   1. Never swap `createClient` for `createServerClient` — that IS the bug.
 *   2. Never pass a cookie adapter, a storage, or anything session-shaped.
 *   3. Never hoist a client into a module-level singleton. One instance per
 *      call is what guarantees no auth state ever crosses two requests.
 *
 * `src/lib/supabase/__tests__/admin.test.ts` pins all three, plus the identity
 * the request actually carries.
 */

function assertServer(fn: string): void {
  // The service_role key bypasses RLS entirely, so a browser is never a
  // legitimate caller. Next does not inline non-NEXT_PUBLIC_* variables into
  // the client bundle, so an accidental import yields `undefined` rather than a
  // leaked key — this turns that confusing failure into a named one.
  if (typeof window !== 'undefined') {
    throw new Error(`${fn}() must never run in the browser.`);
  }
}

/**
 * Default service-role client — **sealed**. Use this everywhere.
 *
 * `accessToken` makes the SDK ask this callback for the request identity
 * instead of consulting its own auth state, and it makes the whole `.auth`
 * namespace throw on access. Measured: `Authorization: Bearer <service_role>`
 * on every request, and `.auth.getSession()` / `.auth.admin` both refuse.
 *
 * That matters because `persistSession: false` alone stops a session being
 * *stored*, not *held* — a later `.auth.setSession()` on the returned client
 * would re-open H3 without anyone touching this file. Sealing turns a
 * convention into an SDK guarantee.
 */
export function createServiceRoleClient() {
  assertServer('createServiceRoleClient');

  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    accessToken: async () => key,
  });
}

/**
 * Unsealed variant — only for the GoTrue admin API (`auth.admin.deleteUser`),
 * which the sealed client deliberately makes unreachable.
 *
 * Named the long way round on purpose: reaching for this should require
 * deciding to. It has exactly one legitimate caller today, in
 * `src/lib/gdpr/deletion.ts`. If you need it for a plain table read, you want
 * `createServiceRoleClient()` instead.
 */
export function createServiceRoleAdminClient() {
  assertServer('createServiceRoleAdminClient');

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
