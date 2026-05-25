import { headers } from 'next/headers';

import { getOptionalUser } from '@/lib/auth/require-user';
import { routing } from '@/i18n/routing';
import { isExcludedRoute, stripLocalePrefix } from '@/components/layout/bottom-tab-bar.routes';

/**
 * Single source of truth for "is the persistent BottomTabBar going to
 * mount for this request?" — used by every Server Component that needs
 * to mirror the bar's visibility to avoid duplicate-nav anti-patterns
 * (Apple HIG / Material 3 mobile-first 2026):
 *
 *   - `src/app/[locale]/layout.tsx`        → mount the bar itself
 *   - `src/components/layout/Header.tsx`   → suppress the marketing burger
 *   - `src/components/layout/Footer.tsx`   → hide redundant link nav on mobile
 *   - `src/app/[locale]/(public)/layout.tsx` → lift the ScrollToTop FAB
 *
 * Returns `true` when both gates pass:
 *   1. An authenticated visitor (`getOptionalUser()` returns a user).
 *   2. The unprefixed pathname is NOT in `BOTTOM_TAB_BAR_EXCLUDED_ROUTES`.
 *
 * The pathname is read from the `x-pathname` request header that
 * `src/proxy.ts` sets BEFORE next-intl runs. `stripLocalePrefix` removes
 * the optional `/<locale>/` segment so the exclusion list works whatever
 * locale the visitor uses.
 *
 * Note on duplication: we accept the four call-sites each running the
 * three-step pipeline (headers → user → exclusion) rather than wrap the
 * function in React `cache()`. `cache()` memoises by argument identity
 * and this helper takes no arguments, so under vitest jsdom (where
 * `cache()` does not get scoped per "render request" the way it does in
 * an RSC pipeline) the first test's result would leak into every
 * subsequent test. Supabase already caches `auth.getUser()` per-request
 * via cookies, so the only redundant work is the header read + string
 * comparison — negligible.
 */
export async function shouldMountBottomTabBar(): Promise<boolean> {
  const requestHeaders = await headers();
  const rawPathname = requestHeaders.get('x-pathname') ?? '/';
  const unprefixedPathname = stripLocalePrefix(rawPathname, routing.locales);
  const user = await getOptionalUser();
  return !!user && !isExcludedRoute(unprefixedPathname);
}
