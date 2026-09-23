import { cache } from 'react';

import { log } from '@/lib/log';

/**
 * Durations of one /app render, logged as ONE structured line so a production
 * measurement can be read in the Vercel runtime logs instead of guessed.
 *
 * Why a log line and not a `Server-Timing` header: a Server Component cannot
 * set a response header in this Next version (`headers()` is read-only), and
 * the proxy only sees the part of the request that happens before rendering.
 *
 * The line carries the route — a literal from `AppRoute`, never a URL with an
 * identifier in it — and three integers. Nothing about the person, the
 * workspace or the data: the type below is the whole contract.
 */
export type AppRoute =
  '/app' | '/app/expenses' | '/app/accounts' | '/app/charges' | '/app/commitments';

type RenderTimings = { session_ms: number | null; snapshot_ms: number | null };

// Per request: React gives every server request its own memo, so a render
// never sees another request's durations.
const currentRender = cache((): RenderTimings => ({ session_ms: null, snapshot_ms: null }));

export function recordStage(stage: keyof RenderTimings, startedAt: number): void {
  currentRender()[stage] = Math.round(performance.now() - startedAt);
}

/**
 * `session_ms`: the session lookup. `snapshot_ms`: the seven snapshot reads.
 * `page_ms`: the page's own read, which runs alongside the snapshot reads.
 */
export function logRenderTiming(route: AppRoute, pageMs: number): void {
  const { session_ms, snapshot_ms } = currentRender();
  log.info('app render timing', {
    route,
    session_ms,
    snapshot_ms,
    page_ms: pageMs,
  });
}
