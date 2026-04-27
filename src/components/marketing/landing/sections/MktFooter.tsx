import { getTranslations } from 'next-intl/server';

import { AnkoraLogo } from '@/components/brand/AnkoraLogo';
import { Link } from '@/i18n/navigation';

/**
 * MktFooter — minimal footer for the public landing.
 *
 * Mirrors `Landing.jsx` cc-design `<Footer>` (lines 480-496):
 * - Top border + horizontal padding
 * - Flex justify-between, wraps on mobile
 * - LEFT: small monogram logo + copyright "Ankora · éditeur ancré à
 *   Bruxelles · 2026"
 * - RIGHT: 4 nav links (Conditions, Confidentialité, Sécurité, Contact)
 *
 * SEPARATED from `<Footer />` (used by every other public page +
 * authenticated app) — that one has the full-fat layout (sitemap,
 * locales, legal blurbs). This one is the marketing-landing minimal
 * variant per cc-design.
 *
 * Functional links target the existing legal/* routes so the footer
 * stays useful (not just visual) — `terms` → `/legal/cgu`,
 * `privacy` → `/legal/privacy`, etc. Security currently points to
 * `#security` placeholder (issue #79); contact at the dedicated route.
 */
export async function MktFooter() {
  const t = await getTranslations('landing.footer');

  const links = [
    { key: 'terms', href: '/legal/cgu' },
    { key: 'privacy', href: '/legal/privacy' },
    // `security` page not built yet — issue #79 tracks creation.
    { key: 'security', href: '#', disabled: true as const },
    { key: 'contact', href: '/' },
  ] as const;

  return (
    <footer className="border-border border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 md:px-6">
        <div className="flex items-center gap-2">
          <AnkoraLogo className="h-5 w-auto" aria-hidden="true" />
          <span className="text-muted-foreground text-xs font-medium">{t('copyright')}</span>
        </div>
        <nav aria-label={t('copyright')} className="flex flex-wrap items-center gap-5">
          {links.map((link) =>
            'disabled' in link && link.disabled ? (
              <span
                key={link.key}
                aria-disabled="true"
                className="text-muted cursor-not-allowed text-xs"
              >
                {t(`links.${link.key}`)}
              </span>
            ) : (
              <Link
                key={link.key}
                href={link.href}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-600 rounded text-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {t(`links.${link.key}`)}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
