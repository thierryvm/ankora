/**
 * Font files preloaded per scope. `scripts/fonts/fonts.json` is the source of
 * truth (its `preload` field); `scripts/fonts/__tests__/fonts.test.ts` fails
 * if this table drifts from it.
 *
 * - `layout`: every page renders body text in Inter, and a French page needs
 *   only the latin file (latin-ext is fetched by `unicode-range` if a
 *   character needs it).
 *
 * Fraunces is deliberately NOT preloaded on the landing. Measured on
 * 15 November 2026 (Lighthouse mobile, local production build, two runs): the
 * LCP element of `/` is the intro paragraph, in Inter, not the Fraunces H1;
 * preloading both Fraunces latin faces made that LCP slower (about 4.1 s
 * against 3.9 s) for the same score and a nil layout shift either way.
 */
export const FONT_PRELOADS = {
  layout: ['/fonts/inter/inter-latin.7011f85f.woff2'],
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
