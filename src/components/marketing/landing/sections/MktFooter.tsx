import { getTranslations } from 'next-intl/server';

import { AnkoraLogo } from '@/components/brand/AnkoraLogo';
import { CookiePreferencesLink } from '@/components/layout/CookiePreferencesLink';
import { Link } from '@/i18n/navigation';
import { SITE } from '@/lib/site';

/**
 * `inline-flex min-h-11 items-center` : ces liens mesuraient 16 px de haut,
 * sous les 24 x 24 px qu'exige WCAG 2.2 AA (2.5.8 Target Size Minimum).
 *
 * L'exception « inline » du critere ne s'applique PAS ici : elle couvre un lien
 * pris dans une phrase, dont la hauteur est contrainte par l'interligne du texte
 * autour. Ceux-ci sont des liens autonomes dans un `<nav>`, donc rien ne les
 * contraint — c'etait bien un echec.
 *
 * 44 px et non 24 : c'est le minimum que ce depot s'impose partout ailleurs
 * (`min-h-11` sur la barre d'onglets, les disclosures, les boutons de banniere).
 * Deux standards de cible tactile selon l'ecran, c'est une incoherence de plus a
 * ne pas installer.
 */
const LINK_CLASS =
  'text-muted-foreground hover:text-foreground focus-visible:ring-brand-600 inline-flex min-h-11 cursor-pointer items-center rounded text-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none';

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
 * Every entry goes where its label says it goes. Two did not, and both are
 * fixed here rather than tolerated:
 *
 * - `contact` pointed at `/` — a link labelled "Contact" that returned the
 *   visitor to the page they were already on. It is now a `mailto:` to the
 *   same address the CGU already publish, which is also the contact means
 *   an information-society provider owes its visitors.
 * - `security` rendered as a greyed, `aria-disabled` word pointing at `#`,
 *   waiting for a page that issue #79 still tracks. A dead entry helps
 *   nobody and advertises the gap; it comes back when the page exists.
 *
 * `cookies` and the preferences button are ADDED: the landing is the most
 * visited page of the site and was the only one with no way to review or
 * withdraw a cookie decision (RGPD art. 7(3) — withdrawing must be as easy
 * as consenting, and "as easy" cannot mean "navigate elsewhere first").
 */
export async function MktFooter() {
  const t = await getTranslations('landing.footer');

  const links = [
    { key: 'terms', href: '/legal/cgu' },
    { key: 'privacy', href: '/legal/privacy' },
    { key: 'cookies', href: '/legal/cookies' },
    { key: 'contact', href: `mailto:${SITE.contactEmail}`, external: true as const },
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
            'external' in link && link.external ? (
              // Plain <a>: `mailto:` is not a route, so the localised Link
              // would try to prefix it with the locale segment.
              <a key={link.key} href={link.href} className={LINK_CLASS}>
                {t(`links.${link.key}`)}
              </a>
            ) : (
              <Link key={link.key} href={link.href} className={LINK_CLASS}>
                {t(`links.${link.key}`)}
              </Link>
            ),
          )}
          <CookiePreferencesLink className={LINK_CLASS} />
        </nav>
      </div>
    </footer>
  );
}
