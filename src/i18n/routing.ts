import { defineRouting } from 'next-intl/routing';

export const LOCALES = ['fr-BE', 'nl-BE', 'en', 'es-ES', 'de-DE'] as const;
export const DEFAULT_LOCALE = 'fr-BE';

export type Locale = (typeof LOCALES)[number];

/**
 * Subset of `LOCALES` that the UI is allowed to surface to end-users for the
 * v1.0 / Beta scope. Doctrine: `CLAUDE.md` "Cap v1.0 publique — Langues v1.0 :
 * FR + EN seulement. NL/DE/ES annoncées dans /roadmap publique, livrées
 * post-launch." Mirrors `ANKORA_V1_LOCALES` in
 * `src/components/ui/lang-switcher.tsx` (same intent, different shape — the
 * switcher carries flag + label metadata, this constant is just the ids for
 * the segmented-control (radiogroup) consumer in
 * `src/components/layout/LocaleSwitcher.tsx`).
 *
 * Note on URL routing: the full `LOCALES` array stays the source of truth for
 * the next-intl middleware + request handler. Deep-links such as `/nl-BE/...`
 * or `/de-DE/...` keep resolving so partial translations from earlier PRs
 * remain reachable for QA and existing bookmarks — they are just invisible
 * in the UI switcher until each locale ships with a validated native review.
 */
export const LOCALES_VISIBLE = ['fr-BE', 'en'] as const satisfies readonly Locale[];

/**
 * Locale resolution is DELIBERATELY reduced to a single deterministic input:
 * the URL prefix, falling back to `defaultLocale`. Both flags below are
 * load-bearing and only make sense together — re-enabling either one alone
 * reintroduces a bug.
 *
 * `localeCookie: false` — next-intl's `syncCookie` rewrites NEXT_LOCALE
 * whenever the locale resolved from the URL differs from the cookie, and the
 * URL prefix always wins. Any request to `/en…` while the cookie held `fr-BE`
 * therefore reset the stored language to English for a year. It is a race: an
 * in-flight `/en…` request lands after the language switcher's Server Action
 * has written the cookie. The page keeps rendering in French while the cookie
 * flips, and the NEXT navigation 307s to `/en` — hence "sometimes, and always
 * back to English" (the FR→EN direction is immune, its requests target
 * unprefixed URLs). Detecting a prefetch in middleware is IMPOSSIBLE: Next
 * strips the `rsc` / `next-router-prefetch` / `sec-purpose` headers AND the
 * `?_rsc` query param before middleware runs, so a prefetch and a real
 * navigation are literally indistinguishable there. Three middleware fixes
 * were built and measured before reaching that conclusion — do not retry that
 * layer. Cf. `docs/audits/2026-07-25-locale-cookie-race-diagnostic.md`.
 *
 * `localeDetection: false` — required BECAUSE of the line above, not
 * independently. In next-intl's `resolveLocale`, the cookie and
 * `Accept-Language` are two branches of the same `localeDetection` gate, so
 * dropping the cookie alone would promote `Accept-Language` to sole detector.
 * Since French lives on unprefixed URLs under `as-needed`, an English-browser
 * visitor who picked French would then be 307'd back to `/en` on every
 * unprefixed URL — French unreachable, deterministically, for a whole class of
 * users. A Dutch-speaking visitor would be pushed to `/nl-BE`, which is not
 * translated. Turning detection off also stops the app from ever auto-serving
 * a locale that has no validated translation (`LOCALES_VISIBLE` is FR + EN for
 * v1.0). Trade-off confirmed by @thierry on 2026-07-25: `/` always renders
 * French, whatever the browser language.
 *
 * The cookie itself still exists and stays useful — `setLocaleAction` writes
 * it, and `src/app/not-found.tsx` + `src/app/auth/callback/route.ts` read it.
 * It simply no longer takes part in middleware routing.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  localeCookie: false,
  localeDetection: false,
});
