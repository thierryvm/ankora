import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

/**
 * Server-side guard for authenticated routes.
 * Redirects to /login if no session. Never trust the client — always call this from RSC/actions.
 */
export async function requireUser(redirectTo = '/login'): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
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
