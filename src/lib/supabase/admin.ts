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
 * Three things must never happen to this module:
 *   1. Never swap `createClient` for `createServerClient` — that IS the bug.
 *   2. Never pass a cookie adapter, a storage, or anything session-shaped.
 *   3. Never hoist the client into a module-level singleton. One instance per
 *      call is what guarantees no auth state ever crosses two requests.
 *
 * `src/lib/supabase/__tests__/admin.test.ts` asserts 1 and 2 statically, and
 * asserts that the request actually carries the service_role key.
 */
export function createServiceRoleClient() {
  // The service_role key bypasses RLS entirely, so a browser is never a
  // legitimate caller. Next does not inline non-NEXT_PUBLIC_* variables into
  // the client bundle, so an accidental import yields `undefined` rather than a
  // leaked key — this turns that confusing failure into a named one.
  if (typeof window !== 'undefined') {
    throw new Error('createServiceRoleClient() must never run in the browser.');
  }

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
