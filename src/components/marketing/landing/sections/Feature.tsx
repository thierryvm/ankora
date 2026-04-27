import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Link } from '@/i18n/navigation';

import { WATERFALL_BARS } from '../constants';
import { ArrowRight } from '../icons';

/**
 * Feature — Cashflow waterfall surface highlight.
 *
 * Mirrors `Landing.jsx` cc-design `<Feature>` (lines 143-180):
 * - Outer card with subtle teal/laiton gradient background
 * - 2-column grid (md+): copy block on the left, SVG waterfall on the right
 * - Left: eyebrow accent + h3 split on 2 lines + paragraph + 2 CTAs
 * - Right: 5-bar SVG (salary, provisions, life, reserve, remaining) reading
 *   left→right as a budget breakdown. Bar colours come from
 *   `WATERFALL_BARS` constants (token classes — no hardcoded hex in JSX).
 *
 * Each `<rect>` uses `currentColor` for fill, with the colour set by the
 * Tailwind `fill-*` token class on the rect itself (Tailwind 4 emits
 * `fill-brand-400`, `fill-accent-400`, etc. from the `@theme` block). The
 * value labels above the bars use the matching `text-*` class so the colour
 * stays in sync if the palette ever moves.
 */
export async function Feature() {
  const t = await getTranslations('landing.feature');

  // SVG geometry — matches cc-design viewBox 0 0 400 200. Bar x-positions and
  // heights come from `WATERFALL_BARS` constants; only width / baseline /
  // label offset are tied to the layout itself.
  const BAR_WIDTH = 46;
  const BASELINE_Y = 180;
  const TEXT_LABEL_OFFSET = 5; // gap between top of bar and its value label

  return (
    <section
      id="feature"
      aria-labelledby="feature-heading"
      className="mx-auto max-w-6xl px-4 py-16 md:px-6"
    >
      <div className="from-brand-surface to-accent-surface border-border grid gap-12 rounded-2xl border bg-linear-to-br p-8 md:grid-cols-2 md:items-center md:p-12">
        {/* LEFT: copy + CTAs */}
        <div>
          <Eyebrow tone="accent">{t('eyebrow')}</Eyebrow>
          <h3
            id="feature-heading"
            className="font-display text-foreground mt-3 text-3xl leading-tight font-semibold tracking-tight md:text-4xl"
          >
            {t('h3Line1')}
            <br />
            {t('h3Line2')}
          </h3>
          <p className="text-muted-foreground mt-4 text-base leading-relaxed text-pretty">
            {t('description')}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button asChild size="sm">
              <Link href="/signup">
                {t('ctaPrimary')}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="#principles">{t('ctaSecondary')}</a>
            </Button>
          </div>
        </div>

        {/* RIGHT: SVG waterfall (a11y: <title> on the <svg> is the single
            source of label — no redundant aria-label on the <figure>). */}
        <figure className="border-border bg-card/50 rounded-2xl border p-5">
          <svg viewBox="0 0 400 200" className="block h-auto w-full" role="img">
            <title>{t('eyebrow')}</title>
            {WATERFALL_BARS.map((bar) => {
              const y = BASELINE_Y - bar.height;
              return (
                <g key={bar.key}>
                  <rect
                    x={bar.x}
                    y={y}
                    width={BAR_WIDTH}
                    height={bar.height}
                    rx="4"
                    fillOpacity="0.85"
                    className={bar.fillClass}
                  />
                  <text
                    x={bar.x + BAR_WIDTH / 2}
                    y={y - TEXT_LABEL_OFFSET}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                    className={bar.textClass}
                    fill="currentColor"
                  >
                    {bar.display}
                  </text>
                  <text
                    x={bar.x + BAR_WIDTH / 2}
                    y={195}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="500"
                    fontFamily="Inter, sans-serif"
                    className="text-muted-foreground"
                    fill="currentColor"
                  >
                    {t(`bars.${bar.key}`)}
                  </text>
                </g>
              );
            })}
          </svg>
        </figure>
      </div>
    </section>
  );
}
