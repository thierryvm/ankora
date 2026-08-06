import { headers } from 'next/headers';

import { getOptionalUser } from '@/lib/auth/require-user';
import { routing } from '@/i18n/routing';
import { isExcludedRoute, stripLocalePrefix } from '@/components/layout/bottom-tab-bar.routes';

/**
 * « La barre d'onglets va-t-elle être montée pour CETTE requête ? », pour les
 * Server Components qui doivent refléter sa visibilité sans dupliquer la
 * navigation (Apple HIG / Material 3 mobile-first 2026).
 *
 * **Deux appelants, et seulement deux** :
 *
 *   - `src/components/layout/Header.tsx`   → supprime le burger marketing
 *   - `src/components/layout/Footer.tsx`   → masque la nav redondante en mobile
 *
 * Ce commentaire en annonçait **quatre** jusqu'au 6 août 2026. Les deux autres —
 * le montage de la barre et le bouton « haut de page » — vivaient dans des
 * layouts que Next ne re-rend PAS en navigation client : leur valeur y était
 * gelée pour la vie du document, et la barre ne pouvait jamais apparaître dans
 * la PWA installée. Ils lisent désormais
 * `@/components/layout/bottom-tab-bar-visibility`, réévalué à chaque navigation.
 *
 * **Les deux appelants restants sont corrects, et il faut qu'ils le restent.**
 * Ils sont rendus par les pages et par `src/app/[locale]/app/layout.tsx`, que
 * Next re-rend bien — et `src/proxy.ts` pose `x-pathname` aussi sur les requêtes
 * RSC. Les faire passer au contexte client les **régresserait** : leur moitié
 * « authentifié » deviendrait figée alors qu'elle ne l'est pas aujourd'hui.
 *
 * Cette liste s'était périmée en silence une fois. Si un troisième appelant
 * apparaît, vérifier d'abord **où il est rendu** avant de le brancher ici.
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
