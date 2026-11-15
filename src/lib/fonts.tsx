/**
 * Font files preloaded per scope. `scripts/fonts/fonts.json` is the source of
 * truth (its `preload` field); `scripts/fonts/__tests__/fonts.test.ts` fails
 * if this table drifts from it.
 *
 * - `layout`: every page renders body text in Inter, and a French page needs
 *   only the latin file (latin-ext is fetched by `unicode-range` if a
 *   character needs it).
 * - `landing`: the hero H1 is set in Fraunces and holds an italic `em`, so
 *   both latin faces are on the LCP path of `/` and nowhere else.
 */
export const FONT_PRELOADS = {
  layout: ['/fonts/inter/inter-latin.woff2'],
  landing: ['/fonts/fraunces/fraunces-latin.woff2', '/fonts/fraunces/fraunces-italic-latin.woff2'],
} as const;

export type FontPreloadScope = keyof typeof FONT_PRELOADS;

/**
 * `<link rel="preload" as="font" type="font/woff2" crossorigin>` for a scope.
 * React 19 hoists a `<link>` rendered anywhere into the document `<head>`, in
 * the server HTML. `react-dom`'s `preload()` was tried first and measured on
 * 15 November 2026: from a Server Component under Next 16 it only reaches the
 * RSC payload as a hint, so the `<link>` appears after the payload script runs
 * — too late to help. `crossOrigin` is not optional: fonts are always fetched
 * in CORS mode, so a preload without it is not reused and the file downloads
 * twice. No nonce: the CSP allows `font-src 'self'`.
 */
export function FontPreloads({ scope }: { scope: FontPreloadScope }) {
  return FONT_PRELOADS[scope].map((href) => (
    <link
      key={href}
      rel="preload"
      href={href}
      as="font"
      type="font/woff2"
      crossOrigin="anonymous"
    />
  ));
}
