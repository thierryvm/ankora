import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';

/**
 * 503-diag instrumentation helper — extracts stack + name when the value
 * is a real `Error`, falls back to `String(e)` otherwise. Stack lines are
 * not redacted by `@/lib/log` (only `email`, `password`, `token`, etc. are),
 * which is what we want during the diagnosis window.
 *
 * Remove this helper + every `[503-diag]` log call once Étape 2 has shipped
 * the targeted fix and the runtime evidence is collected.
 */
function diagDetails(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    return { name: e.name, msg: e.message, stack: e.stack };
  }
  return { msg: String(e) };
}

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
 *
 * 503-diag (2026-05-27): `error` from `getUser()` and any thrown exception
 * are now logged before being swallowed. Filter Vercel logs on
 * `[503-diag] require-user` to surface the silent failure mode that
 * persisted through hotfix #1–#4 on PR-BETA-3.
 */
export async function getOptionalUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      if (error) {
        log.warn('[503-diag] require-user getOptionalUser getUser error', {
          status: (error as { status?: number }).status,
          msg: error.message,
        });
      }
      return null;
    }

    return user;
  } catch (e) {
    log.warn('[503-diag] require-user getOptionalUser caught throw', diagDetails(e));
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
    log.warn('[503-diag] require-user requireUser redirect', { redirectTo });
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

  // 503-diag (2026-05-27): the previous version silently ignored the
  // Supabase `error` field. A PGRST transient or RLS denial would surface
  // as `data === null` and bounce the user to `/onboarding` falsely, which
  // is exactly the silent failure mode @cowork suspects on the 503.
  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.error('[503-diag] require-user workspace_members query error', {
      userId: user.id,
      code: error.code,
      msg: error.message,
    });
  }

  if (!membership) {
    log.warn('[503-diag] require-user no membership redirect onboarding', {
      userId: user.id,
      hadError: !!error,
    });
    redirect('/onboarding');
  }

  return {
    user,
    workspaceId: membership.workspace_id,
    role: membership.role as 'owner' | 'editor' | 'viewer',
  };
}
