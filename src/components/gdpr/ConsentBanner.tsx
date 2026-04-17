'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'ankora.consent.v1';
const CONSENT_VERSION = '1.0.0';

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

function persist(state: ConsentState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Module-level snapshot cache. useSyncExternalStore requires getSnapshot() to
 * return a stable reference between invalidations — otherwise React loops.
 * We only recompute when subscribers are notified (persist or storage event).
 */
let cachedSnapshot: ConsentState | null = null;
let cachedInitialized = false;

function getSnapshot(): ConsentState | null {
  if (!cachedInitialized) {
    cachedSnapshot = readStored();
    cachedInitialized = true;
  }
  return cachedSnapshot;
}

function getServerSnapshot(): ConsentState | null {
  return null;
}

const STORAGE_LISTENERS = new Set<() => void>();

function subscribe(cb: () => void) {
  STORAGE_LISTENERS.add(cb);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cachedSnapshot = readStored();
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
  cachedSnapshot = readStored();
  STORAGE_LISTENERS.forEach((cb) => cb());
}

/**
 * Minimal cookie banner — essentials always on, analytics/marketing off by default.
 * Server-side consent recording happens only once the user is authenticated
 * via Server Action `recordConsent()`. Until then, localStorage is the source of truth.
 */
export function ConsentBanner() {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || stored !== null) return null;

  const accept = (analytics: boolean, marketing: boolean) => {
    persist({
      version: CONSENT_VERSION,
      analytics,
      marketing,
      decidedAt: new Date().toISOString(),
    });
    setDismissed(true);
    notify();
  };

  return (
    <div
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-xl border border-(--color-border) bg-(--color-card) p-5 shadow-lg md:inset-x-auto md:left-1/2 md:-translate-x-1/2"
    >
      <h2 id="consent-title" className="text-base font-semibold">
        Cookies et vie privée
      </h2>
      <p id="consent-body" className="mt-2 text-sm text-(--color-muted-foreground)">
        On utilise uniquement les cookies essentiels pour te connecter. Les cookies d&apos;analyse
        sont désactivés par défaut — tu peux les activer si tu veux nous aider à améliorer Ankora.
        Tu peux changer d&apos;avis à tout moment via{' '}
        <Link href="/legal/cookies" className="underline">
          la politique cookies
        </Link>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => accept(false, false)}
          className="rounded-md border border-(--color-border) px-4 py-2 text-sm font-medium hover:bg-(--color-brand-100) focus-visible:ring-2 focus-visible:ring-(--color-brand-600) focus-visible:outline-none"
        >
          Essentiels uniquement
        </button>
        <button
          type="button"
          onClick={() => accept(true, false)}
          className="rounded-md bg-(--color-brand-700) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-brand-800) focus-visible:ring-2 focus-visible:ring-(--color-brand-600) focus-visible:outline-none"
        >
          Accepter les analyses
        </button>
      </div>
    </div>
  );
}
