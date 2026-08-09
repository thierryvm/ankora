import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  typedRoutes: true,
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },

  /**
   * Short-locale aliases (/fr /nl /de /es) → full locale paths.
   * Prevents 404s when users or external links use 2-letter codes.
   * fr-BE is the defaultLocale (served at /), so /fr-BE and /fr both
   * point home.
   */
  async redirects() {
    return [
      /**
       * `/app/simulator` a été supprimée le 8 août 2026 : le simulateur n'est
       * pas un lieu où l'on va, c'est une question qu'on pose à une situation.
       * Il ne subsiste que sous la forme du tiroir du cockpit.
       * Cf. `docs/superpowers/specs/2026-08-08-refonte-app-architecture-cible.md` §2.1.
       *
       * Une redirection plutôt qu'un 404 : l'URL a pu être mise en favori, et
       * elle a vécu plusieurs mois. Elle mène au cockpit **sans ouvrir le
       * tiroir** — ouvrir une fenêtre modale en réponse à une demande de page
       * surprendrait, et câbler un paramètre d'URL vers un tiroir mérite d'être
       * fait une fois, délibérément, pour toutes les feuilles à la fois.
       *
       * Les redirections de config s'appliquent AVANT le proxy, donc avant
       * next-intl. La variante non préfixée couvre le français (defaultLocale
       * servi à la racine) ; la seconde couvre les quatre locales préfixées.
       * Aucune boucle possible : la cible ne rematche aucune des deux sources.
       *
       * TEMPORAIRE (307), volontairement — c'est la seule ligne de ce tableau à
       * ne pas être permanente. Un 308 est mis en cache par le navigateur SANS
       * expiration : il ne redemande plus jamais l'URL au serveur. Or le
       * paragraphe ci-dessus annonce lui-même que le câblage URL → tiroir sera
       * repris « une fois, délibérément, pour toutes les feuilles ». Si cette
       * passe décide un jour que cette URL doit ouvrir le tiroir, tout
       * navigateur ayant vu un 308 resterait collé sur `/app` — et le symptôme,
       * « ça ne marche que sur une machine neuve », est parmi les plus coûteux à
       * diagnostiquer. La prudence ne coûte rien ici : l'URL est derrière
       * l'authentification et en `noindex`, aucun enjeu de référencement ne
       * justifie la permanence. Passer en 308 quand la décision sera arrêtée.
       */
      { source: '/app/simulator', destination: '/app', permanent: false },
      {
        source: '/:locale(en|nl-BE|de-DE|es-ES)/app/simulator',
        destination: '/:locale/app',
        permanent: false,
      },

      { source: '/fr', destination: '/', permanent: true },
      { source: '/nl', destination: '/nl-BE', permanent: true },
      { source: '/de', destination: '/de-DE', permanent: true },
      { source: '/es', destination: '/es-ES', permanent: true },
      { source: '/fr/:path*', destination: '/:path*', permanent: true },
      { source: '/nl/:path*', destination: '/nl-BE/:path*', permanent: true },
      { source: '/de/:path*', destination: '/de-DE/:path*', permanent: true },
      { source: '/es/:path*', destination: '/es-ES/:path*', permanent: true },
    ];
  },

  /**
   * Static security headers. CSP nonce-based header is set per-request
   * in src/proxy.ts to support strict-dynamic with React streaming.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), interest-cohort=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
      // PR-SEC-ADMIN — defense-in-depth on /[locale]/admin/* surface.
      // Pattern matches both the default-locale shape (/admin/*) and prefixed
      // locales (/en/admin/*, /nl-BE/admin/*, etc.). Headers stack on top of
      // global ones above.
      //
      // Rationale per directive:
      //   X-Robots-Tag: hard-stop indexing even if robots.txt is missed by a
      //     scraper; redundant with metadata.robots but resilient to
      //     framework-level metadata regressions.
      //   Cache-Control: no-store + private = no CDN cache, no browser cache;
      //     prevents an admin page being served stale to a colleague who
      //     borrows the device or to a CDN edge after a logout.
      //   Referrer-Policy: same-origin (tighter than the global
      //     strict-origin-when-cross-origin) — admin URLs MUST NOT leak to
      //     third parties via the Referer header on outbound links.
      //   Content-Security-Policy: frame-ancestors 'none' is enforced
      //     globally via the nonce-based CSP middleware; not duplicated here
      //     to avoid drift, only documented for clarity.
      // THI-244 Phase A (perf): self-hosted variable fonts under /public/fonts/
      // are content-addressable in practice (a new release would land at a new
      // filename, never with the same name + different bytes), so we mark them
      // immutable for one year. Eliminates the `max-age=0, must-revalidate`
      // default that triggered a conditional revalidation on every navigation
      // for ~1.45 MB of TTF (audit
      // `docs/audits/2026-05-19-thi-225-perf-investigation-1sec-nav-lag.md`
      // §RC #1). Combined with the TTF → WOFF2 migration shipped in this PR,
      // first-load cost drops by ~66 % and every subsequent navigation pays 0
      // font bytes until the next deploy that touches /fonts.
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nocache' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
      {
        source: '/:locale(en|nl-BE|de-DE|es-ES)/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nocache' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
