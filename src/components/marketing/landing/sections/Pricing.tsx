import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Num } from '@/components/ui/num';
import { Link } from '@/i18n/navigation';

import { ArrowRight, Check, Sparkles } from '../icons';

/**
 * Pricing — "Free during Phase 1" surface.
 *
 * Mirrors `Landing.jsx` cc-design `<Pricing>` (lines 366-464):
 * - Centered eyebrow accent + h2 (font-display)
 * - Main card (max-w-720) with subtle teal gradient + brand border, hosting:
 *   • Decorative anchor SVG in background (aria-hidden, opacity 5%)
 *   • Phase 1 badge (uppercase tracked)
 *   • Big "0 €" price (font-mono 64px) + period caption
 *   • Body paragraph (FSMA-safe: "no card asked, no time limit", no upsell)
 *   • 4-feature checklist (Check icon + muted-foreground text)
 *   • CTA primary
 * - Separate roadmap note card (dashed border) below: Sparkles icon + title
 *   + body + "Lire la roadmap →" link to /roadmap
 *
 * Per SKILL.md §0 + §8, NO paid pricing tiers may ship before Phase 1
 * lifts. This card is the only correct pricing surface for v1.0.
 */
export async function Pricing() {
  const t = await getTranslations('landing.pricing');

  const features = ['cockpit', 'simulator', 'manualEntry', 'export'] as const;

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="mx-auto max-w-6xl px-4 py-20 text-center md:px-6"
    >
      <Eyebrow tone="accent">{t('eyebrow')}</Eyebrow>
      <h2
        id="pricing-heading"
        className="font-display text-foreground mt-3 mb-12 text-3xl leading-tight font-semibold tracking-tight md:text-4xl"
      >
        {t('h2')}
      </h2>

      {/* Main pricing card */}
      <div className="from-brand-surface to-brand-surface/30 border-brand-surface-border relative mx-auto max-w-2xl overflow-hidden rounded-2xl border bg-linear-to-br p-8 md:p-12">
        {/* Decorative anchor glyph */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="text-brand-400 pointer-events-none absolute -right-8 -bottom-10 h-44 w-44 opacity-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          <path d="M12 2v20M7 7a5 5 0 1110 0M4 18a8 8 0 008 4 8 8 0 008-4M3 14h4M17 14h4" />
        </svg>

        <div className="relative">
          {/* Phase badge */}
          <div className="bg-brand-surface text-brand-text-strong mb-5 inline-flex items-center rounded-full px-3 py-1 text-[10.5px] font-medium tracking-widest uppercase">
            {t('phaseBadge')}
          </div>

          {/* Price */}
          <Num size="xl" className="text-foreground block text-6xl leading-none tracking-tight">
            {t('price')}
          </Num>
          <p className="text-muted-foreground mt-2 mb-6 text-sm">{t('period')}</p>

          {/* Body */}
          <p className="text-foreground mx-auto mb-7 max-w-md text-base leading-relaxed text-pretty">
            {t('body')}
          </p>

          {/* Features checklist */}
          <ul className="mx-auto mb-8 grid max-w-sm gap-2.5 text-left">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5">
                <Check
                  aria-hidden="true"
                  className="text-brand-text-strong mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="text-muted-foreground text-sm leading-snug">
                  {t(`features.${feature}`)}
                </span>
              </li>
            ))}
          </ul>

          <Button asChild size="lg">
            <Link href="/signup">
              {t('ctaPrimary')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Roadmap note — quieter card below the main pricing card */}
      <aside
        aria-labelledby="pricing-roadmap-title"
        className="border-border bg-card/80 mx-auto mt-6 max-w-2xl rounded-2xl border border-dashed p-5 text-left md:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="bg-accent-surface border-accent-surface-border text-accent-text-strong flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 id="pricing-roadmap-title" className="text-foreground mb-1.5 text-sm font-semibold">
              {t('roadmap.title')}
            </h3>
            <p className="text-muted-foreground text-[13px] leading-relaxed text-pretty">
              {t('roadmap.body')}{' '}
              <Link
                href="/"
                className="text-brand-text-strong hover:text-brand-text inline whitespace-nowrap underline-offset-2 hover:underline"
              >
                {t('roadmap.link')}
              </Link>
            </p>
          </div>
        </div>
      </aside>
    </section>
  );
}
