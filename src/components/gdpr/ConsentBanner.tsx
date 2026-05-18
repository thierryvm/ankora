'use client';

import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { recordCookieConsentAction } from '@/lib/actions/consent';

const STORAGE_KEY = 'ankora.consent.v1';
const REOPEN_FLAG_KEY = 'ankora.consent.reopen';
export const CONSENT_VERSION = '1.0.0';

type ConsentState = {
  version: string;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
};

function readStored(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isReopenRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(REOPEN_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function persist(state: ConsentState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Reopen flag is consumed: any successful decision dismisses the banner.
  window.localStorage.removeItem(REOPEN_FLAG_KEY);
}

/**
 * Module-level snapshot cache. useSyncExternalStore requires getSnapshot() to
 * return a stable reference between invalidations — otherwise React loops.
 * We only recompute when subscribers are notified (persist or storage event).
 */
let cachedInitialized = false;

type StoreSnapshot = {
  stored: ConsentState | null;
  reopen: boolean;
};

const SNAPSHOT_REF: { value: StoreSnapshot } = {
  value: { stored: null, reopen: false },
};

function refreshSnapshot(): void {
  const next: StoreSnapshot = {
    stored: readStored(),
    reopen: isReopenRequested(),
  };
  // Stable identity unless the relevant fields changed.
  const prev = SNAPSHOT_REF.value;
  if (
    prev.stored?.version !== next.stored?.version ||
    prev.stored?.analytics !== next.stored?.analytics ||
    prev.stored?.marketing !== next.stored?.marketing ||
    prev.reopen !== next.reopen
  ) {
    SNAPSHOT_REF.value = next;
  }
}

function getSnapshot(): StoreSnapshot {
  if (!cachedInitialized) {
    refreshSnapshot();
    cachedInitialized = true;
  }
  return SNAPSHOT_REF.value;
}

// Frozen module-level constant for SSR: useSyncExternalStore requires
// getServerSnapshot() to return a referentially stable value across calls,
// otherwise React logs "The result of getServerSnapshot should be cached
// to avoid an infinite loop" and may re-render in a tight loop.
const SERVER_SNAPSHOT: StoreSnapshot = { stored: null, reopen: false };

function getServerSnapshot(): StoreSnapshot {
  return SERVER_SNAPSHOT;
}

const STORAGE_LISTENERS = new Set<() => void>();

function subscribe(cb: () => void) {
  STORAGE_LISTENERS.add(cb);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === REOPEN_FLAG_KEY) {
      refreshSnapshot();
      cb();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    STORAGE_LISTENERS.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

function notify() {
  refreshSnapshot();
  STORAGE_LISTENERS.forEach((cb) => cb());
}

/**
 * Test-only escape hatch — forces the module-level snapshot cache to be
 * recomputed from a fresh `localStorage` read on the next render. Vitest
 * shares module state between test cases by default, so without this the
 * banner would carry the consent decision of one test into the next.
 *
 * Not exported in any production import path (only `__tests__/` files
 * call it). Kept inside the module so the cache implementation stays
 * private.
 */
export function __resetConsentCacheForTests(): void {
  cachedInitialized = false;
  SNAPSHOT_REF.value = { stored: null, reopen: false };
}

/**
 * Test-only accessor that returns the SSR snapshot used by
 * useSyncExternalStore. Exposed so a Vitest can assert referential
 * stability without going through a real SSR render cycle.
 */
export function __getServerSnapshotForTests(): StoreSnapshot {
  return getServerSnapshot();
}

/**
 * Programmatically requests the banner to re-open. Called from the Settings
 * "Reset choice" button and the Footer "Manage cookie preferences" link so
 * the user can revisit their decision from anywhere.
 *
 * Implementation: clears the consent record AND sets a reopen flag. The flag
 * is necessary because the version-cookie removal alone cannot distinguish
 * "first visit" from "user-requested reopen" cleanly across SSR boundaries.
 */
export function reopenConsentBanner(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.setItem(REOPEN_FLAG_KEY, '1');
  notify();
}

export function ConsentBanner() {
  const t = useTranslations('consent');
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [, startTransition] = useTransition();

  // Post-hydration refresh: the module-level snapshot cache survives
  // soft navigations within the SPA. If localStorage was written in
  // another tab (multi-tab race) or in a previous route before this
  // banner mounted, getSnapshot() may return a stale value taken from
  // the first pre-hydration read. Forcing a notify() at mount re-reads
  // localStorage and wakes up all subscribers (including this one).
  useEffect(() => {
    notify();
  }, []);

  const hasDecided = snap.stored !== null;
  const shouldShow = !dismissed && (!hasDecided || snap.reopen);
  if (!shouldShow) return null;

  const accept = (analyticsValue: boolean, marketingValue: boolean) => {
    persist({
      version: CONSENT_VERSION,
      analytics: analyticsValue,
      marketing: marketingValue,
      decidedAt: new Date().toISOString(),
    });
    setDismissed(true);
    notify();
    startTransition(() => {
      void recordCookieConsentAction({
        analytics: analyticsValue,
        marketing: marketingValue,
      });
    });
  };

  return (
    <div
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
      className="border-border bg-card fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-xl border p-5 shadow-lg md:inset-x-auto md:left-1/2 md:-translate-x-1/2"
    >
      <h2 id="consent-title" className="text-base font-semibold">
        {t('title')}
      </h2>
      <p id="consent-body" className="text-muted-foreground mt-2 text-sm">
        {t.rich('body', {
          link: (chunks) => (
            <Link href="/legal/cookies" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>

      {customizing ? (
        <div className="mt-4 flex flex-col gap-3">
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">{t('customize.legend')}</legend>

            <label className="border-border flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                checked
                disabled
                aria-label={t('customize.essentialLabel')}
                className="text-brand-700 mt-0.5 h-4 w-4"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  {t('customize.essentialLabel')}{' '}
                  <span className="text-muted-foreground text-xs font-normal">
                    {t('customize.essentialBadge')}
                  </span>
                </span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {t('customize.essentialDescription')}
                </span>
              </span>
            </label>

            <label className="border-border flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                aria-label={t('customize.analyticsLabel')}
                className="text-brand-700 focus-visible:ring-brand-600 mt-0.5 h-4 w-4 focus-visible:ring-2 focus-visible:outline-none"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">{t('customize.analyticsLabel')}</span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {t('customize.analyticsDescription')}
                </span>
              </span>
            </label>

            <label className="border-border flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                aria-label={t('customize.marketingLabel')}
                className="text-brand-700 focus-visible:ring-brand-600 mt-0.5 h-4 w-4 focus-visible:ring-2 focus-visible:outline-none"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">{t('customize.marketingLabel')}</span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {t('customize.marketingDescription')}
                </span>
              </span>
            </label>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => accept(analytics, marketing)}
              className="bg-brand-700 hover:bg-brand-800 focus-visible:ring-brand-600 rounded-md px-4 py-2 text-sm font-medium text-white focus-visible:ring-2 focus-visible:outline-none"
            >
              {t('customize.save')}
            </button>
            <button
              type="button"
              onClick={() => setCustomizing(false)}
              className="border-border hover:bg-brand-100 focus-visible:ring-brand-600 rounded-md border px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              {t('customize.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => accept(false, false)}
            className="border-border hover:bg-brand-100 focus-visible:ring-brand-600 rounded-md border px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('essentialOnly')}
          </button>
          <button
            type="button"
            onClick={() => setCustomizing(true)}
            className="border-border hover:bg-brand-100 focus-visible:ring-brand-600 rounded-md border px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('customize.button')}
          </button>
          <button
            type="button"
            onClick={() => accept(true, true)}
            className="bg-brand-700 hover:bg-brand-800 focus-visible:ring-brand-600 rounded-md px-4 py-2 text-sm font-medium text-white focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('acceptAll')}
          </button>
        </div>
      )}
    </div>
  );
}
