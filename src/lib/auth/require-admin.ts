import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { env } from '@/lib/env';

import { requireUser } from './require-user';

/**
 * Server-side guard for `/[locale]/admin/*` routes.
 *
 * Initial PR-D4-PHASE2-B implementation: allow-list of Supabase user IDs via
 * `ANKORA_ADMIN_USER_IDS` (comma-separated, server-only env). Initially
 * contains @thierry's user_id only. Future PRs may migrate to a
 * `workspace_members.role`-based check.
 *
 * Order of operations:
 *   1. requireUser() — redirects to /login if no session.
 *   2. ID match against ANKORA_ADMIN_USER_IDS — redirects to /app if not admin.
 *
 * The redirect target is `/app` (not /404) on intent: a logged-in non-admin
 * should land on their dashboard, not see a 404 that suggests the route is
 * broken.
 */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();

  const rawIds = env.ANKORA_ADMIN_USER_IDS ?? '';
  const allowed = new Set(
    rawIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );

  if (!allowed.has(user.id)) {
    redirect('/app');
  }

  return user;
}
