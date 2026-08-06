import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { elevationDue } from '@/lib/auth/require-elevated';
import { describeReadFailure } from '@/lib/data/read-failure';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Resolve the locale to apply on the post-OAuth redirect.
 *
 * Reads the `NEXT_LOCALE` cookie, whose sole writer is `setLocaleAction` (the
 * LocaleSwitcher) since 2026-07-25 — next-intl no longer manages it
 * (`localeCookie: false`, cf. `src/i18n/routing.ts`). This route is one of the
 * two remaining readers, with `src/app/not-found.tsx`, and the reason the
 * cookie is still worth writing at all. The Supabase OAuth roundtrip preserves browser
 * cookies (the Google redirect URL stays on the same eTLD+1 and the cookie
 * is `SameSite=Lax` — see `src/i18n/routing.ts`), so the locale the visitor
 * picked BEFORE clicking "Sign in" survives the external hop.
 *
 * Falls back to `routing.defaultLocale` (fr-BE) if the cookie is missing or
 * carries an unknown value. The TS type guard rules out a spoofed cookie.
 */
/**
 * Reads the cookie DELIBERATELY, and must keep doing so — do not "simplify"
 * this to `getLocale()` from `next-intl/server`. This route is excluded from
 * the proxy matcher (`src/proxy.ts`), so the middleware never runs here and the
 * `X-NEXT-INTL-LOCALE` header `getLocale()` relies on is absent. It would fall
 * back to `resolveLocaleFromUserOrCookie()` in `src/i18n/request.ts`, which
 * costs an extra `auth.getUser()` plus a `users` select on the OAuth hot path,
 * for the same value the cookie already carries.
 */
async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('NEXT_LOCALE')?.value;
  const candidates: readonly string[] = routing.locales;
  if (raw && candidates.includes(raw)) {
    return raw as Locale;
  }
  return routing.defaultLocale;
}

/**
 * Apply the `localePrefix: 'as-needed'` rule for the redirect target.
 *
 * `routing.defaultLocale` (fr-BE) renders unprefixed (`/app`, `/onboarding`).
 * Every other locale receives an explicit `/<locale>` prefix
 * (`/en/app`, `/de-DE/onboarding`, …) so the next-intl proxy resolves the
 * right page without bouncing through a 302 that strips/repaints the locale
 * cookie mid-flight. Cf. THI-279 (PR-BETA-CLEANUP, 2026-05-25): without
 * this prefix the post-login URL collapsed to `/en?code=…` when the
 * visitor signed in from an EN landing — the bar mount and the cockpit
 * never reached the browser.
 */
function localiseTarget(locale: Locale, target: string): string {
  if (locale === routing.defaultLocale) return target;
  return `/${locale}${target}`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const rawNext = url.searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/app';
  const locale = await resolveLocale();

  if (!code) {
    return NextResponse.redirect(
      new URL(localiseTarget(locale, '/login?error=missing_code'), request.url),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(localiseTarget(locale, '/login?error=exchange_failed'), request.url),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL(localiseTarget(locale, '/login'), request.url));
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('onboarded_at')
    .eq('id', user.id)
    .maybeSingle();

  // Same rule as `loginAction`: a read that failed is not an answer, and the
  // answer it used to be mistaken for — "you have not onboarded" — is the one
  // that makes a returning user think their workspace is gone. Decline to
  // conclude and let the destination's own guard decide on a clean read.
  //
  // A route handler has no error boundary above it, so throwing here would
  // produce a bare 500 mid-OAuth with no way back. Deferring is the honest move
  // that also keeps the visitor moving.
  // Truthiness, not `!== null`: a PostgREST client that has nothing to report
  // may hand back `undefined` rather than `null`, and treating that as a failure
  // would send every single sign-in to `next` — silently disabling onboarding
  // for genuinely new users.
  const readFailed = Boolean(profileError);

  if (readFailed) {
    log.error('auth/callback: users.onboarded_at unreadable, deferring to target', {
      ...describeReadFailure(profileError),
    });
  }

  // Second factor still owed? Straight to the challenge, not via `/app`.
  //
  // Bouncing would work — the destination's own guard sends them there anyway —
  // but it costs a wasted RSC render and an extra 307 on every Google sign-in.
  // Wrapped: this route sits outside the proxy matcher and has no error
  // boundary above it, so an unexpected throw here is a bare 500 mid-OAuth with
  // no way back. On failure we fall through to the pre-existing destination,
  // whose own guard still enforces the challenge.
  let owesSecondFactor = false;
  try {
    owesSecondFactor = await elevationDue(supabase, user);
  } catch (thrown) {
    log.error('auth/callback: elevation check failed, deferring to target', {
      ...describeReadFailure(thrown),
    });
  }
  if (owesSecondFactor) {
    return NextResponse.redirect(new URL(localiseTarget(locale, '/login/2fa'), request.url));
  }

  const target = readFailed || profile?.onboarded_at ? next : '/onboarding';
  return NextResponse.redirect(new URL(localiseTarget(locale, target), request.url));
}
