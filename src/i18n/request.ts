import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';

import { createClient } from '@/lib/supabase/server';

import { DEFAULT_LOCALE, LOCALES, routing, type Locale } from './routing';

async function resolveLocaleFromUserOrCookie(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get('NEXT_LOCALE')?.value;
  if (hasLocale(LOCALES, cookieValue)) {
    return cookieValue;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('users').select('locale').eq('id', user.id).single();
      if (data?.locale && hasLocale(LOCALES, data.locale)) {
        return data.locale;
      }
    }
  } catch {
    // Supabase unavailable in unit tests or build time — fall back silently.
  }

  return DEFAULT_LOCALE;
}

async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  try {
    return (await import(`../../messages/${locale}.json`)).default;
  } catch {
    return (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default;
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = hasLocale(LOCALES, requested)
    ? requested
    : await resolveLocaleFromUserOrCookie();

  const messages = await loadMessages(locale);

  return {
    locale,
    messages,
    timeZone: 'Europe/Brussels',
    now: new Date(),
  };
});

export { routing };
