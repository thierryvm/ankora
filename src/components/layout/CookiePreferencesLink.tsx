'use client';

import { useTranslations } from 'next-intl';

import { reopenConsentBanner } from '@/components/gdpr/ConsentBanner';

/**
 * Footer link that reopens the cookie consent banner from any page so the
 * user can revisit their decision (RGPD art. 7(3) — withdrawing consent
 * must be as easy as giving it).
 *
 * Implementation note: rendered as a `<button>` (not `<a>`) because the
 * action mutates client-side state (localStorage flag) rather than
 * navigating. Styled to blend in with the surrounding footer links.
 */
export function CookiePreferencesLink() {
  const t = useTranslations('footer');
  return (
    <button
      type="button"
      onClick={() => reopenConsentBanner()}
      className="text-muted-foreground focus-visible:ring-brand-600 cursor-pointer rounded text-left text-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
    >
      {t('cookiePreferences')}
    </button>
  );
}
