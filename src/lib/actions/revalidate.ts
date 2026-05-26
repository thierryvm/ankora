import { revalidatePath } from 'next/cache';

const APP_ROOT = '/[locale]/app';

/**
 * Triggers a Next.js cache revalidation for the cockpit / dashboard surfaces.
 *
 * **Synchronous by contract.** This wraps `revalidatePath(...)` which is itself
 * sync — Next.js queues the invalidation and returns immediately. Callers can
 * use `try { revalidateDashboard(); } catch { ... }` without `await`.
 *
 * Pass the route through next/cache with the dynamic `[locale]` segment so
 * Next.js matches the file-system route across all configured locales (cf.
 * Next.js 16 docs on dynamic route segments).
 *
 * ⚠️ If this function ever becomes async (e.g. wraps a remote cache purge or
 * an async API), update ALL call-sites to `await revalidateDashboard()`
 * inside their try/catch, otherwise unhandled promise rejections will leak
 * past the sync `catch` block. Search references with:
 * `grep -r "revalidateDashboard("`.
 */
export function revalidateDashboard(): void {
  revalidatePath(APP_ROOT, 'page');
}

/**
 * Invalidate a sub-route of the in-app surface (e.g. 'charges', 'expenses',
 * 'accounts', 'settings', 'settings/deletion-status') for every locale.
 */
export function revalidateAppPath(subPath: string): void {
  revalidatePath(`${APP_ROOT}/${subPath}`, 'page');
}
