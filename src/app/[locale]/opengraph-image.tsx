import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';

import { routing, type Locale } from '@/i18n/routing';

/**
 * Dynamic OpenGraph image for each locale.
 *
 * Resolves to a PNG 1200×630 served at:
 *   /opengraph-image          (default locale, fr-BE)
 *   /<locale>/opengraph-image (other locales)
 *
 * Used by Next.js automatically for `<meta property="og:image">` and
 * `<meta name="twitter:image">` when the static `images: [...]` array
 * in `generateMetadata` is omitted (which happens for the cards that
 * the framework auto-discovers).
 *
 * For surfaces that override `openGraph.images` (page-level), this
 * route is still discoverable directly. We keep the SITE.url-based
 * `metadataBase` in the layout so absolute URLs are always emitted.
 *
 * Reference: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */

export const alt = 'Ankora — Cockpit financier personnel';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Params = { params: Promise<{ locale: string }> };

export default async function OpenGraphImage({ params }: Params) {
  const { locale } = await params;
  const safeLocale: Locale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;

  const t = await getTranslations({ locale: safeLocale, namespace: 'common' });
  const tagline = t('tagline');
  // Description coupée à 140 chars max pour laisser respirer la card.
  const fullDescription = t('description');
  const description =
    fullDescription.length > 140 ? fullDescription.slice(0, 137).trimEnd() + '…' : fullDescription;

  // Trust strip — locale-aware via opengraphImage.* keys (cf. messages/{fr-BE,en}.json)
  const ogT = await getTranslations({ locale: safeLocale, namespace: 'opengraphImage' });
  const trustHosting = ogT('trustHosting');
  const trustNoBank = ogT('trustNoBank');
  const trustFree = ogT('trustFree');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0b1120',
          backgroundImage:
            'radial-gradient(circle at 20% 25%, rgba(45, 212, 191, 0.18) 0%, transparent 55%), radial-gradient(circle at 85% 80%, rgba(251, 191, 36, 0.12) 0%, transparent 50%)',
          color: '#e2e8f0',
          padding: '80px 96px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top — Brand mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
          }}
        >
          {/* Anchor mark (custom SVG inline) */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #2dd4bf 0%, #0F766E 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 44,
              fontWeight: 700,
              color: '#0b1120',
            }}
          >
            ⚓
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: '#e2e8f0',
            }}
          >
            Ankora
          </div>
        </div>

        {/* Middle — Tagline + description */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              color: '#5eead4',
              maxWidth: 1000,
            }}
          >
            {tagline}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 400,
              lineHeight: 1.4,
              color: 'rgba(226, 232, 240, 0.85)',
              maxWidth: 960,
            }}
          >
            {description}
          </div>
        </div>

        {/* Bottom — Trust strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '32px',
            borderTop: '1px solid rgba(94, 234, 212, 0.2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '32px',
              fontSize: 22,
              color: 'rgba(226, 232, 240, 0.7)',
            }}
          >
            <span>{trustHosting}</span>
            <span>·</span>
            <span>{trustNoBank}</span>
            <span>·</span>
            <span>{trustFree}</span>
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#fbbf24',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            ankora.be
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
