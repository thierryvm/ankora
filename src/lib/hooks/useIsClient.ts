'use client';

import { useSyncExternalStore } from 'react';

/**
 * SSR-safe "is this rendering on the client?" flag, implemented as a
 * `useSyncExternalStore` so it does not trip the React 19 lint rule
 * `react-hooks/set-state-in-effect` (which fires on the naive
 * `useState(false) + useEffect(() => setMounted(true), [])` pattern).
 *
 * The underlying "store" is intentionally not observable — there is nothing
 * to subscribe to, because the environment (server vs client) is fixed for
 * the lifetime of any given render. The client snapshot returns `true`, the
 * server snapshot returns `false`, and the subscribe function is a no-op
 * because the value never needs to update mid-render.
 *
 * Primary use case: gating `React.createPortal(..., document.body)` so the
 * portal never tries to render during SSR (where `document` is undefined).
 *
 * Introduced 2026-05-19 (PR P0-V2) per Sourcery review on PR #171.
 */
function subscribeToClientEnv(): () => void {
  return () => {};
}

function getClientSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsClient(): boolean {
  return useSyncExternalStore(subscribeToClientEnv, getClientSnapshot, getServerSnapshot);
}
