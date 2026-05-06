'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { reopenConsentBanner, CONSENT_VERSION } from '@/components/gdpr/ConsentBanner';
import { recordCookieConsentAction } from '@/lib/actions/consent';
import type { CookieConsentSnapshot } from '@/lib/actions/consent-types';

const STORAGE_KEY = 'ankora.consent.v1';

type LocalConsent = {
  version: string;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
};

function readLocal(): LocalConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalConsent;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal(state: LocalConsent): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearLocal(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

type Props = {
  /**
   * Server-fetched snapshot from `getCookieConsentAction()`. May be `null` if
   * the user hasn't decided yet on this device, in which case we surface the
   * "no choice yet" state and ask them to use the banner.
   */
  initialServerSnapshot: CookieConsentSnapshot | null;
};

export function CookiesPreferencesSection({ initialServerSnapshot }: Props) {
  const t = useTranslations('app.settings.cookies');
  const [analytics, setAnalytics] = useState<boolean>(initialServerSnapshot?.analytics ?? false);
  const [marketing, setMarketing] = useState<boolean>(initialServerSnapshot?.marketing ?? false);
  const [hasDecided, setHasDecided] = useState<boolean>(initialServerSnapshot !== null);
  const [pending, startTransition] = useTransition();

  // On mount, hydrate from localStorage if it has a fresher decision than the
  // server snapshot — the user may have toggled while logged out and we want
  // the UI to reflect their actual current local state.
  //
  // The eslint rule against synchronous setState-in-effect is intentionally
  // disabled here: localStorage is an external system unavailable during SSR,
  // so the read MUST happen after mount. The conditional means we only set
  // state when the local decision is genuinely newer than the server one,
  // which prevents the cascading-render anti-pattern the rule guards against.
  useEffect(() => {
    const local = readLocal();
    if (!local) return;
    if (!initialServerSnapshot || local.decidedAt > (initialServerSnapshot.decidedAt ?? '')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnalytics(local.analytics);

      setMarketing(local.marketing);

      setHasDecided(true);
    }
  }, [initialServerSnapshot]);

  const save = (nextAnalytics: boolean, nextMarketing: boolean) => {
    writeLocal({
      version: CONSENT_VERSION,
      analytics: nextAnalytics,
      marketing: nextMarketing,
      decidedAt: new Date().toISOString(),
    });
    setAnalytics(nextAnalytics);
    setMarketing(nextMarketing);
    setHasDecided(true);
    startTransition(async () => {
      const res = await recordCookieConsentAction({
        analytics: nextAnalytics,
        marketing: nextMarketing,
      });
      if (res.ok) toast.success(t('toastSaved'));
      else toast.error(t('toastError'));
    });
  };

  const reset = () => {
    clearLocal();
    setAnalytics(false);
    setMarketing(false);
    setHasDecided(false);
    reopenConsentBanner();
    startTransition(async () => {
      await recordCookieConsentAction({ analytics: false, marketing: false });
      toast.success(t('toastReset'));
    });
  };

  return (
    <Card id="cookies-preferences">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="border-border flex items-start gap-3 rounded-md border p-4">
          <input
            type="checkbox"
            checked
            disabled
            aria-label={t('essentialLabel')}
            className="text-brand-700 mt-0.5 h-4 w-4"
          />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {t('essentialLabel')}{' '}
              <span className="text-muted-foreground text-xs font-normal">
                {t('essentialBadge')}
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{t('essentialDescription')}</p>
          </div>
        </div>

        <div className="border-border flex items-start gap-3 rounded-md border p-4">
          <input
            id="analytics-toggle"
            type="checkbox"
            checked={analytics}
            onChange={(e) => save(e.target.checked, marketing)}
            disabled={pending}
            aria-label={t('analyticsLabel')}
            className="text-brand-700 focus-visible:ring-brand-600 mt-0.5 h-4 w-4 focus-visible:ring-2 focus-visible:outline-none"
          />
          <div className="flex-1">
            <label htmlFor="analytics-toggle" className="text-sm font-medium">
              {t('analyticsLabel')}
            </label>
            <p className="text-muted-foreground mt-1 text-xs">{t('analyticsDescription')}</p>
          </div>
        </div>

        <div className="border-border flex items-start gap-3 rounded-md border p-4">
          <input
            id="marketing-toggle"
            type="checkbox"
            checked={marketing}
            onChange={(e) => save(analytics, e.target.checked)}
            disabled={pending}
            aria-label={t('marketingLabel')}
            className="text-brand-700 focus-visible:ring-brand-600 mt-0.5 h-4 w-4 focus-visible:ring-2 focus-visible:outline-none"
          />
          <div className="flex-1">
            <label htmlFor="marketing-toggle" className="text-sm font-medium">
              {t('marketingLabel')}
            </label>
            <p className="text-muted-foreground mt-1 text-xs">{t('marketingDescription')}</p>
          </div>
        </div>

        <div className="border-border border-t pt-4">
          <Button type="button" variant="outline" onClick={reset} disabled={pending}>
            {t('resetButton')}
          </Button>
          <p className="text-muted-foreground mt-2 text-xs">
            {hasDecided ? t('resetHint') : t('noDecisionHint')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
