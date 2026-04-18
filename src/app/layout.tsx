/**
 * Root layout is intentionally a passthrough. The real `<html>`/`<body>` live in
 * `src/app/[locale]/layout.tsx` so the `lang` attribute always reflects the active locale.
 * Every renderable page is nested under `[locale]`; route handlers and metadata
 * files (auth/callback, manifest, robots, sitemap) don't require a layout.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
