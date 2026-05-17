import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

/**
 * Soft variant of `requireUser` — returns the user if a valid session
 * exists, `null` otherwise. NEVER redirects, NEVER throws.
 *
 * Use this for public surfaces (landing, FAQ, glossaire, legal pages…) that
 * need to render different content based on the visitor's auth state without
 * forcing them off the page. Example: showing a "My cockpit" CTA instead of
 * "Sign in" in the marketing header.
 *
 * Same anti-spoofing properties as `requireUser`: hits
 * `supabase.auth.getUser()` server-side rather than trusting a cookie claim.
 *
 * Transient Supabase failures (network blip, JWT secret rotation, transient
 * DB outage) are swallowed and surface as `null` — public surfaces must
 * always render, degrading gracefully to anonymous chrome rather than 500.
 */
export async function getOptionalUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

/**
 * Server-side guard for authenticated routes.
 * Redirects to /login if no session. Never trust the client — always call this from RSC/actions.
 *
 * Delegates the session lookup to `getOptionalUser` so the Supabase wiring
 * (createClient + getUser + error handling) lives in a single place.
 */
export async function requireUser(redirectTo = '/login'): Promise<User> {
  const user = await getOptionalUser();

  if (!user) {
    redirect(redirectTo);
  }

  return user;
}

/**
 * Like requireUser but also returns the workspace_member row.
 * Redirects to /onboarding if user has no workspace yet.
 */
export async function requireUserWithWorkspace(): Promise<{
  user: User;
  workspaceId: string;
  role: 'owner' | 'editor' | 'viewer';
}> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect('/onboarding');
  }

  return {
    user,
    workspaceId: membership.workspace_id,
    role: membership.role as 'owner' | 'editor' | 'viewer',
  };
}
