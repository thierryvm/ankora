'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js on first paint in production only.
 * Skipped in dev to avoid caching Turbopack chunks that change on every save.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* swallow — SW is nice-to-have, never blocks app boot */
      });
    };

    if (document.readyState === 'complete') {
      onLoad();
      return;
    }
    window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
