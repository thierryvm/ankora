import type { User } from '@supabase/supabase-js';
import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import {
  AUTH_BACKEND_UNAVAILABLE_DIGEST,
  classifyAuthFailure,
  endsSession,
} from '@/lib/auth/auth-error';
import { assertReadable, describeReadFailure } from '@/lib/data/read-failure';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';

/**
 * Raised when the auth backend could not be reached, as opposed to having ruled
 * that the session is over. It exists so `requireUser()` has something to throw
 * that is unmistakably "infrastructure", and so a caller that genuinely wants to
 * degrade (a public page) can tell the two apart.
 *
 * It carries a fixed `digest`. Throwing without one would reach
 * `src/app/[locale]/error.tsx` as an anonymous error and render "Quelque chose
 * s'est cassé" — telling a user their app is broken when in fact a dependency is
 * briefly unreachable and their data is untouched. The digest is what lets that
 * boundary say so honestly. See `AUTH_BACKEND_UNAVAILABLE_DIGEST`.
 */
export class AuthBackendUnavailableError extends Error {
  override readonly name = 'AuthBackendUnavailableError';

  readonly digest = AUTH_BACKEND_UNAVAILABLE_DIGEST;

  constructor(override readonly cause: unknown) {
    super('Supabase auth backend unavailable');
  }
}

/**
 * The three — and only three — outcomes of asking "who is this visitor?".
 *
 * Collapsing `unavailable` into `anonymous` is what made a Supabase outage look
 * like a mass session expiry: every signed-in user was redirected to `/login`
 * while the incident stayed invisible. Measured on 2026-07-30 against an
 * unreachable auth host with a valid session — `/app` answered `307 → /login`.
 */
type SessionLookup =
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous' }
  | { status: 'unavailable'; cause: unknown };

async function lookupSession(): Promise<SessionLookup> {
  let error: unknown = null;
  let user: User | null = null;

  try {
    const supabase = await createClient();
    const result = await supabase.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch (thrown) {
    // auth-js rethrows only what it does not own — a transport failure or a
    // decode error. Never an auth verdict, so never a reason to sign anyone out.
    error = thrown;
  }

  if (user && !error) {
    return { status: 'authenticated', user };
  }

  if (error && !endsSession(classifyAuthFailure(error))) {
    return { status: 'unavailable', cause: error };
  }

  // Either the session is over (the auth server ruled so, or the cookie is no
  // longer readable), or there was simply no session to begin with
  // (`error === null`, `user === null` — an anonymous visitor).
  return { status: 'anonymous' };
}

function logUnavailable(where: string, cause: unknown): void {
  const record = typeof cause === 'object' && cause !== null ? (cause as Record<string, unknown>) : null;
  log.error(`auth backend unavailable in ${where}`, {
    name: typeof record?.name === 'string' ? record.name : typeof cause,
    code: typeof record?.code === 'string' ? record.code : undefined,
    status: typeof record?.status === 'number' ? record.status : undefined,
  });
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
 * A Supabase outage still degrades to `null` here, and that is correct for this
 * function: a marketing page must render anonymous chrome rather than 500. The
 * difference from before is that it is now a decision taken with the outage
 * *identified* and logged at `error` level, instead of every failure being
 * flattened into "no user" — which is what let an outage masquerade as a mass
 * session expiry on protected routes. `requireUser()` makes the opposite call.
 */
export async function getOptionalUser(): Promise<User | null> {
  const lookup = await lookupSession();

  if (lookup.status === 'authenticated') {
    return lookup.user;
  }

  if (lookup.status === 'unavailable') {
    logUnavailable('getOptionalUser (degrading to anonymous)', lookup.cause);
  }

  return null;
}

/**
 * Server-side guard for authenticated routes.
 * Never trust the client — always call this from RSC/actions.
 *
 * Three outcomes, and the third one is the point of this function:
 *   - signed in            → the user
 *   - session over / none  → locale-aware redirect to `/login`
 *   - auth backend down    → throws `AuthBackendUnavailableError`
 *
 * It deliberately does NOT delegate to `getOptionalUser`, which cannot tell an
 * outage from an expired session. Sharing that path is what made Supabase being
 * unreachable indistinguishable from every user's session ending at once: the
 * whole signed-in userbase got bounced to `/login`, and the incident showed up as
 * "people keep having to log in again" rather than as an outage. Surfacing is the
 * lesser harm — a visible error is recoverable, a silent logout during an incident
 * teaches users the app is flaky.
 */
export async function requireUser(): Promise<User> {
  const lookup = await lookupSession();

  if (lookup.status === 'authenticated') {
    return lookup.user;
  }

  if (lookup.status === 'unavailable') {
    logUnavailable('requireUser', lookup.cause);
    throw new AuthBackendUnavailableError(lookup.cause);
  }

  // Locale-aware on purpose: `localePrefix: 'as-needed'` means French lives
  // on unprefixed URLs, so a bare `redirect('/login')` sends an English user
  // to the French login page. next-intl stopped covering for this when
  // `localeDetection` was turned off (#258) — the cookie branch that used to
  // 307 `/login` to `/en/login` is gone. This `redirect` returns `never` and
  // throws synchronously like the one from `next/navigation`, and its type
  // forces the locale to be passed.
  return redirect({ href: '/login', locale: await getLocale() });
}

/**
 * Like requireUser but also returns the workspace_member row.
 *
 * Three outcomes, same shape as `requireUser`:
 *   - a membership exists   → it is returned
 *   - the query found none  → redirect to /onboarding
 *   - the query FAILED      → throws `DataReadUnavailableError`
 *
 * The third used to be folded into the second. A transient Postgres error or an
 * RLS regression sent an established user to onboarding — which, to someone who
 * tracks their budget here, reads as "my workspace and my data are gone". The
 * information to tell them apart was already on hand: the old code computed
 * `hadError` purely to put it in a log line, then routed identically either way.
 */
export async function requireUserWithWorkspace(): Promise<{
  user: User;
  workspaceId: string;
  role: 'owner' | 'editor' | 'viewer';
}> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.error('require-user: workspace_members unreadable', {
      userId: user.id,
      ...describeReadFailure(error),
    });
  }

  // Throws on a failed read; returns quietly when the query simply matched
  // nothing. Ordering matters: this must run BEFORE the `!membership` branch,
  // or a failed read falls straight through into "you have no workspace".
  assertReadable(error, 'require-user: workspace_members');

  if (!membership) {
    return redirect({ href: '/onboarding', locale: await getLocale() });
  }

  return {
    user,
    workspaceId: membership.workspace_id,
    role: membership.role as 'owner' | 'editor' | 'viewer',
  };
}
