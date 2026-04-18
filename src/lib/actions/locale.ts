'use server';

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

  return { ok: true };
}
