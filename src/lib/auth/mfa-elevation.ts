import type { User } from '@supabase/supabase-js';

/**
 * Does this session still owe its second factor?
 *
 * Supabase hands out an `aal1` session even when a verified factor exists — it
 * never blocks on its own, it only exposes that a higher level is reachable.
 * Requiring the step-up is the application's job, and until 2026-08-06 nothing
 * in this codebase did it: enrolling a factor turned the settings screen green
 * and changed nothing else. A control that is present, labelled active, and
 * inert is worse than an absent one, because it changes how carefully someone
 * guards their password.
 *
 * ## Why a predicate and not a per-action table
 *
 * The first design listed which Server Actions require `aal2`. It would have
 * DEADLOCKED enrolment: an account with no factor can never reach `aal2`, so
 * demanding `aal2` to enrol — or to verify the very code that grants it — locks
 * 2FA out of reach permanently for everyone who has not enabled it yet.
 *
 * The predicate has no such failure mode, and needs no exception list: an
 * account with no verified factor is never refused anywhere. A table would also
 * have gone stale at the next action added; this cannot.
 */
export type EtatElevation = {
  /** A verified factor exists on this account. */
  facteurVerifie: boolean;
  /**
   * The level carried by the session, or `null` when it could not be read.
   *
   * `null` is NOT "no factor" — it is "we could not tell", and it is treated as
   * owing the step-up (see below).
   */
  niveauCourant: string | null;
};

/**
 * True when the visitor must present their second factor before going further.
 *
 * ## Fail CLOSED on an unreadable level, and why that is safe
 *
 * A backend outage never reaches this predicate: `lookupSession()` classifies it
 * as `unavailable` and `requireUser()` throws before any of this runs. This code
 * only executes once the auth server has just answered. An unreadable level here
 * therefore means an undecodable token — bytes the client holds. Letting those
 * through would make the bypass a matter of sending a malformed cookie.
 *
 * "Closed" means SHOWING THE CHALLENGE, never signing anyone out and never a
 * 500. The visitor presents their code, or signs out from that screen.
 */
export function elevationManquante(etat: EtatElevation): boolean {
  // No verified factor: nothing to step up to. This branch is what keeps
  // enrolment reachable, so it is checked first and unconditionally.
  if (!etat.facteurVerifie) return false;
  return etat.niveauCourant !== 'aal2';
}

/**
 * Reads the factors from the USER, not from the session.
 *
 * `mfa.getAuthenticatorAssuranceLevel()` derives its answer from
 * `session.user.factors` — a copy stored in the cookie. A device whose cookie
 * predates the enrolment would report "no factor" and never be challenged: the
 * hole would move rather than close. The SDK says as much about cookie-stored
 * users ("must not be trusted", `GoTrueClient.js`).
 *
 * The caller passes the user returned by `getUser()`, which is a network round
 * trip the session lookup has already paid for — fresh and authoritative.
 */
export function aUnFacteurVerifie(user: Pick<User, 'factors'>): boolean {
  return (user.factors ?? []).some((factor) => factor.status === 'verified');
}

/**
 * The `aal` claim of an access token, or `null` when it cannot be read.
 *
 * Decoded locally, on purpose. The security argument is that the SAME token was
 * just validated server-side by `getUser()` in this very request: a forged one
 * would already have produced an error and never reached here. So no signature
 * check is repeated, and no second network call is spent on every page.
 *
 * Hand-rolled rather than borrowed: auth-js exposes its decoder only under
 * `dist/main/lib/helpers`, which is internal and free to disappear without a
 * major version. Twelve lines beat a dependency on someone's private path.
 */
export function lireNiveauDuJeton(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;

  const payload = accessToken.split('.')[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decode = (input: string): string =>
      typeof atob === 'function' ? atob(input) : Buffer.from(input, 'base64').toString('binary');
    const claims: unknown = JSON.parse(decode(base64));

    if (typeof claims !== 'object' || claims === null) return null;
    const aal = (claims as Record<string, unknown>).aal;
    return typeof aal === 'string' ? aal : null;
  } catch {
    // Undecodable payload. `null` flows into `elevationManquante`, which treats
    // it as owing the step-up — see its docstring.
    return null;
  }
}
