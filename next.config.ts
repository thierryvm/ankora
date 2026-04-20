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
      { source: '/fr', destination: '/', permanent: true },
      { source: '/fr-BE', destination: '/', permanent: true },
      { source: '/nl', destination: '/nl-BE', permanent: true },
      { source: '/de', destination: '/de-DE', permanent: true },
      { source: '/es', destination: '/es-ES', permanent: true },
      { source: '/fr/:path*', destination: '/:path*', permanent: true },
      { source: '/fr-BE/:path*', destination: '/:path*', permanent: true },
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
    ];
  },
};

export default withNextIntl(nextConfig);
