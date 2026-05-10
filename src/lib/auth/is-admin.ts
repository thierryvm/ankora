import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-side admin check that returns a boolean instead of redirecting.
 *
 * Use cases:
 *   - Conditional UI rendering (AppHeader admin link visible only to admins)
 *   - Server actions that need a soft check (return early, don't redirect)
 *
 * For route guards (`/[locale]/admin/*` layout), use `requireAdmin()` instead —
 * it redirects to `/login` (no session) or `/app` (authenticated non-admin)
 * and returns the user object for downstream consumers.
 *
 * Implementation notes:
 *   - Reads `ANKORA_ADMIN_USER_IDS` (server-only env, CSV of Supabase user IDs)
 *   - Catches any error from Supabase client (cookies misread, transient network)
 *     and returns `false` — secure-by-default fail-closed semantics
 *   - Allow-list trim + filter empty so leading/trailing commas don't widen scope
 *   - Empty allow-list → returns `false` (no magical "everyone is admin"); the
 *     env must contain at least one explicit user_id to ever return true
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    const allowList = (env.ANKORA_ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (allowList.length === 0) return false;

    return allowList.includes(user.id);
  } catch {
    // Fail-closed: any error during auth check denies admin access.
    return false;
  }
}
