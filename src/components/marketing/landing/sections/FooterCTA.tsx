import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

import { ArrowRight } from '../icons';

/**
 * FooterCTA — final conversion surface before the marketing footer.
 *
 * Mirrors `Landing.jsx` cc-design `<FooterCTA>` (lines 466-478):
 * - Generous bottom padding (post-pricing breathing room)
 * - Large H2 with serif Fraunces italic on the highlight (`h2Highlight`),
 *   tinted brand-300 like the Hero H1 to close the visual loop
 * - Description (max-w-540), text-muted-foreground for AAA
 * - CTA primary (`Ouvrir mon cockpit`) with ArrowRight icon
 *
 * No image, no glow — the card stack from Pricing is the visual climax;
 * this section is intentionally calm to let the CTA breathe.
 */
export async function FooterCTA() {
  const t = await getTranslations('landing.footerCta');

  return (
    <section
      aria-labelledby="footer-cta-heading"
      className="mx-auto max-w-6xl px-4 pt-20 pb-32 text-center md:px-6"
    >
      <h2
        id="footer-cta-heading"
        className="font-display text-foreground mb-5 text-4xl leading-tight font-semibold tracking-tight text-balance md:text-5xl lg:text-6xl"
      >
        {t('h2Lead')}{' '}
        <em className="text-brand-text-strong font-display italic">{t('h2Highlight')}</em>
      </h2>
      <p className="text-muted-foreground mx-auto mt-5 mb-8 max-w-md text-base leading-relaxed text-pretty md:text-lg">
        {t('description')}
      </p>
      <Button asChild size="lg">
        <Link href="/signup">
          {t('ctaPrimary')}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
