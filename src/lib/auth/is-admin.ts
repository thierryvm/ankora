import { env } from '@/lib/env';
import { lookupSession } from '@/lib/auth/require-user';

/**
 * Server-side admin check that returns a boolean instead of redirecting.
 *
 * Use cases:
 *   - Conditional UI rendering (AppHeader admin link visible only to admins)
 *   - Server actions that need a soft check (return early, don't redirect)
 *
 * For route guards (`/[locale]/admin/*` layout), use `requireAdmin()` instead —
 * it redirects to `/login` (no session) or `/app` (authenticated non-admin)
 * and returns the user object for downstream consumers. This function only
 * decides what is SHOWN; it is never the gate.
 *
 * Implementation notes:
 *   - Asks "who is this?" through `lookupSession()`, the request-memoized lookup
 *     the layouts and the snapshot already share, so a render has ONE identity
 *     path. It used to call `auth.getUser()` itself and rely on Next collapsing
 *     the identical fetch; the memo makes that rule ours. Outside a render (a
 *     Server Action) `cache` memoizes nothing: one `getUser` per call, as before.
 *   - Only an `authenticated` lookup can be an admin. `anonymous`, `unavailable`
 *     (auth backend unreachable) and any thrown error return `false` —
 *     secure-by-default fail-closed semantics.
 *   - Reads `ANKORA_ADMIN_USER_IDS` (server-only env, CSV of Supabase user IDs)
 *   - Allow-list trim + filter empty so leading/trailing commas don't widen scope
 *   - Empty allow-list → returns `false` (no magical "everyone is admin"); the
 *     env must contain at least one explicit user_id to ever return true
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const lookup = await lookupSession();
    if (lookup.status !== 'authenticated') return false;

    const allowList = (env.ANKORA_ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (allowList.length === 0) return false;

    return allowList.includes(lookup.user.id);
  } catch {
    // Fail-closed: any error during auth check denies admin access.
    return false;
  }
}
