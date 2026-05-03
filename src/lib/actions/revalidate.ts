import { revalidatePath } from 'next/cache';

const APP_ROOT = '/[locale]/app';

/**
 * Invalidate the dashboard root (`/[locale]/app/page.tsx`) for every locale.
 * Pass the route through next/cache with the dynamic `[locale]` segment so Next.js
 * matches the file-system route across all configured locales (cf. Next.js 16 docs
 * on dynamic route segments).
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
