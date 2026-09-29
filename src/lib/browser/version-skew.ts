/**
 * Version skew: a tab opened before a deployment, still running the old build.
 *
 * Next.js already handles the navigation half of it. Each RSC response carries
 * the server's build (or deployment) id, and on a mismatch the router does a
 * full-page navigation instead of a soft one (read in next 16.3.5,
 * `client/components/router-reducer/fetch-server-response.js`).
 *
 * What it does not handle is the asset half. A host that only serves the latest
 * deployment — Vercel without Skew Protection, which the Hobby plan does not
 * offer — no longer has the old build's lazy chunks, so the next one the stale
 * tab asks for fails to load. That error lands in the nearest error boundary,
 * and `reset()` cannot cure it: re-rendering asks for the same missing file.
 * Only a real reload, which fetches the new HTML and manifest, does.
 *
 * This module recognises that failure and decides whether one automatic reload
 * is allowed. It is pure and has no React or Next import, so it is tested alone.
 */

/**
 * The wordings each engine uses for a chunk or module that did not load, plus
 * the Server Action one (an action id from the old build is unknown to the new
 * server). Only matched on errors WITHOUT a digest: a digest means the error was
 * thrown on the server, which is never a missing browser chunk.
 */
const SKEW_PATTERNS: readonly RegExp[] = [
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Failed to find Server Action/i,
];

export function isVersionSkewError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ((error as Error & { digest?: unknown }).digest) return false;
  if (error.name === 'ChunkLoadError') return true;
  const message = typeof error.message === 'string' ? error.message : '';
  return SKEW_PATTERNS.some((pattern) => pattern.test(message));
}

export const AUTO_RELOAD_KEY = 'ankora.skew-reload.at';

/**
 * One automatic reload per window. Five minutes is long enough that a reload
 * which does not cure the error (a genuine bug that happens to look like a
 * missing chunk) stops there and shows the error screen, and short enough that
 * a later, separate deployment gets its own reload.
 */
export const AUTO_RELOAD_WINDOW_MS = 5 * 60 * 1000;

type StampStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Whether the error boundary may reload by itself now. Records the attempt when
 * it says yes. Every doubt answers « no »: without a readable and writable
 * stamp, the page after the reload could not know it had already been reloaded,
 * and the fallback — the error screen with its « Réessayer » button — is far
 * better than a reload loop.
 */
export function shouldAutoReload(storage: StampStorage | null | undefined, now: number): boolean {
  if (!storage) return false;
  try {
    const previous = storage.getItem(AUTO_RELOAD_KEY);
    if (previous !== null) {
      const at = Number(previous);
      if (!Number.isFinite(at)) return false;
      if (now - at < AUTO_RELOAD_WINDOW_MS) return false;
    }
    storage.setItem(AUTO_RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/** `window.sessionStorage`, or null where reading it throws (sandboxed iframe, some private modes). */
export function sessionStorageOrNull(): StampStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
