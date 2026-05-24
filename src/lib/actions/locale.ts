'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { LOCALES } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/types';

const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const localeSchema = z.enum(LOCALES, { error: 'locale.invalid' });

export async function setLocaleAction(input: unknown): Promise<ActionResult> {
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorCode: 'errors.locale.invalid' };
  }

  const locale = parsed.data;

  const cookieJar = await cookies();
  cookieJar.set(LOCALE_COOKIE_NAME, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.from('users').update({ locale }).eq('id', user.id);
  }

  // THI-276 / PR-BETA-2bis (2026-05-24) — corollaire architectural au
  // retrait de `router.refresh()` côté client (PR-BETA-2). Sans cette
  // invalidation server-side du cache RSC, les entries précédemment
  // prefetched par `<Link>` (Next 16 prefetch on viewport) gardent
  // leur payload rendu dans l'ancienne locale. Au prochain click
  // utilisateur sur un `<Link href="/faq">`, le router client sert la
  // version cachée — la page apparaît dans l'ancienne langue malgré
  // le cookie `NEXT_LOCALE` mis à jour. Bug observable sur iPhone
  // Safari par @thierry sur preview PR #181 (TICKET 7 mobile reproduit
  // sur pages publiques anonymes, exclut donc une cause `users.locale`
  // Supabase). Les E2E Chromium passaient car `page.goto` est une hard
  // navigation qui bypass le router cache.
  //
  // `revalidatePath('/', 'layout')` invalide le cache pour TOUTES les
  // routes sous `/` (scope `'layout'`), ce qui couvre l'app entière
  // sans avoir à enumérer chaque route. Pas de coût perceptible :
  // l'invalidation est lazy (les routes ne sont refetched que si
  // l'utilisateur y navigue ensuite).
  revalidatePath('/', 'layout');

  return { ok: true };
}
