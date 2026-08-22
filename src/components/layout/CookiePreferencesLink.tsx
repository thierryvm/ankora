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
 *
 * The default class carries `inline-flex min-h-11 items-center` so the target
 * clears WCAG 2.2 AA · 2.5.8 (24 × 24 px minimum) wherever it is dropped in
 * without a class of its own. It was the ONLY control in `Footer.tsx` still
 * measuring 226 × 20 on 2026-08-22 — its four sibling links had been raised to
 * `min-h-11` at the call site, and this one could not be, because its class
 * lives here. A shared control has to carry its own floor: a fix applied to
 * every call site is a fix that misses the one whose styling is elsewhere.
 */
export function CookiePreferencesLink({ className }: { className?: string } = {}) {
  const t = useTranslations('footer');
  return (
    <button
      type="button"
      onClick={() => reopenConsentBanner()}
      className={
        className ??
        'text-muted-foreground focus-visible:ring-brand-600 inline-flex min-h-11 cursor-pointer items-center rounded text-left text-sm hover:underline focus-visible:ring-2 focus-visible:outline-none'
      }
    >
      {t('cookiePreferences')}
    </button>
  );
}
