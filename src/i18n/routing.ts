import { defineRouting } from 'next-intl/routing';

export const LOCALES = ['fr-BE', 'nl-BE', 'en', 'es-ES', 'de-DE'] as const;
export const DEFAULT_LOCALE = 'fr-BE';

export type Locale = (typeof LOCALES)[number];

/**
 * Subset of `LOCALES` that the UI is allowed to surface to end-users for the
 * v1.0 / Beta scope. Doctrine: `CLAUDE.md` "Cap v1.0 publique — Langues v1.0 :
 * FR + EN seulement. NL/DE/ES annoncées dans /roadmap publique, livrées
 * post-launch." Mirrors `ANKORA_V1_LOCALES` in
 * `src/components/atoms/LangSwitcher.tsx` (same intent, different shape — the
 * atom carries flag + label metadata, this constant is just the ids for the
 * plain `<select>` consumer in `src/components/layout/LocaleSwitcher.tsx`).
 *
 * Note on URL routing: the full `LOCALES` array stays the source of truth for
 * the next-intl middleware + request handler. Deep-links such as `/nl-BE/...`
 * or `/de-DE/...` keep resolving so partial translations from earlier PRs
 * remain reachable for QA and existing bookmarks — they are just invisible
 * in the UI switcher until each locale ships with a validated native review.
 */
export const LOCALES_VISIBLE = ['fr-BE', 'en'] as const satisfies readonly Locale[];

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
});
