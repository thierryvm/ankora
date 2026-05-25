import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Resolve the locale to apply on the post-OAuth redirect.
 *
 * Reads the `NEXT_LOCALE` cookie (set by next-intl + by `setLocaleAction`
 * via the LocaleSwitcher). The Supabase OAuth roundtrip preserves browser
 * cookies (the Google redirect URL stays on the same eTLD+1 and the cookie
 * is `SameSite=Lax` — see `src/i18n/routing.ts`), so the locale the visitor
 * picked BEFORE clicking "Sign in" survives the external hop.
 *
 * Falls back to `routing.defaultLocale` (fr-BE) if the cookie is missing or
 * carries an unknown value. The TS type guard rules out a spoofed cookie.
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

  const { data: profile } = await supabase
    .from('users')
    .select('onboarded_at')
    .eq('id', user.id)
    .maybeSingle();

  const target = profile?.onboarded_at ? next : '/onboarding';
  return NextResponse.redirect(new URL(localiseTarget(locale, target), request.url));
}
