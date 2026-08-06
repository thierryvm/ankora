import type { SupabaseClient, User } from '@supabase/supabase-js';

import { aUnFacteurVerifie, elevationManquante, lireNiveauDuJeton } from './mfa-elevation';

/**
 * Does this session still owe its second factor?
 *
 * The two inputs come from ONE pass, never two independent calls:
 *
 *   - the factors ride on the `user` the caller already obtained from
 *     `getUser()` — a network round trip, so authoritative and fresh. Reading
 *     them from the session instead would consult the cookie's copy, which on a
 *     device enrolled elsewhere still says "no factor";
 *   - the level is decoded from the access token of that same session. No
 *     signature check is repeated: `getUser()` just validated this very token
 *     server-side in this request, so a forged one would already have failed.
 *
 * Never throws. A session read that fails yields a `null` level, which
 * `elevationManquante` treats as owing the step-up — but only when a verified
 * factor exists, so an account without one is never affected.
 */
export async function elevationDue(
  supabase: SupabaseClient,
  user: Pick<User, 'factors'>,
): Promise<boolean> {
  const facteurVerifie = aUnFacteurVerifie(user);

  // Short-circuit on the common case: no factor, nothing to step up to, and no
  // reason to touch the session at all.
  if (!facteurVerifie) return false;

  let accessToken: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token ?? null;
  } catch {
    // Leave `accessToken` null — fail closed, i.e. show the challenge.
  }

  return elevationManquante({
    facteurVerifie,
    niveauCourant: lireNiveauDuJeton(accessToken),
  });
}

/** Error code returned by a Server Action refused for want of the second factor. */
export const MFA_REQUISE = 'errors.auth.mfaRequired' as const;
