import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Glass } from '@/components/ui/glass';
import { Num } from '@/components/ui/num';
import { Row } from '@/components/ui/row';
import { Link } from '@/i18n/navigation';

import { HERO_BROWSER_DOTS, HERO_KPIS, HERO_SPARKLINE } from '../constants';
import { ArrowRight, Globe, Lock, Shield, Sliders, Sparkles } from '../icons';

/**
 * Hero — public landing top-of-fold.
 *
 * Mirrors `Landing.jsx` cc-design `<Hero>`:
 * - Sparkles badge ("Nouveau · Simulateur what-if")
 * - H1 with serif Fraunces italic on the highlight (`h1Highlight`)
 * - Description (max 620px), two CTAs (primary + outline-with-icon)
 * - Three trust micro-signals (Lock / Shield / Globe)
 * - Glass mockup card with macOS-style dots, "Aperçu cockpit" eyebrow,
 *   3 KPIs (`<Glass>` + `<Eyebrow>` + `<Num>`) and a decorative sparkline
 *
 * The radial-glow background from the mockup is intentionally omitted in
 * this first iteration — Ankora light mode reads cleanly without it. To be
 * re-evaluated visually at the @cowork checkpoint and added back via a
 * `.lp-hero-glow` global class if judged essential.
 *
 * KPI numbers come from `constants.ts` (illustrative, NOT real user data —
 * "Aperçu cockpit" eyebrow per @cowork R1 to make this transparent).
 */
export async function Hero() {
  const t = await getTranslations('landing.hero');

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative mx-auto max-w-6xl overflow-hidden px-4 pt-20 pb-16 text-center md:px-6 md:pt-28"
    >
      {/* Decorative radial glow (cc-design fidelity).
          Inline `style.background` bypasses any potential cascade quirk where
          a class-based `background` could be overridden by Tailwind utility
          backgrounds — this guarantees the gradient renders. The colour pulls
          from `--color-brand-400` via `color-mix` so it stays in sync with
          the design system across light + dark + admin accent flips. */}
      <div
        aria-hidden="true"
        data-testid="hero-radial-glow"
        className="pointer-events-none absolute -inset-x-[20%] -top-[40%] -z-0 h-[90%]"
        style={{
          background:
            'radial-gradient(50% 60% at 50% 20%, color-mix(in oklab, var(--color-brand-400) 15%, transparent), transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-3xl">
        {/* Badge */}
        <Row
          gap={2}
          justify="center"
          className="bg-brand-surface border-brand-surface-border text-brand-text-strong mx-auto mb-8 inline-flex w-auto rounded-full border px-3 py-1.5 text-xs font-medium"
        >
          <Sparkles aria-hidden="true" className="h-3 w-3" />
          <span>{t('badge')}</span>
        </Row>

        {/* H1 */}
        <h1
          id="hero-heading"
          className="font-display text-foreground text-5xl leading-tight font-semibold tracking-tight text-balance md:text-7xl"
        >
          {t('h1Lead')}{' '}
          <em className="text-brand-300 font-display italic not-italic">{t('h1Highlight')}</em>
        </h1>

        {/* Description */}
        <p className="text-muted-foreground mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-pretty">
          {t('description')}
        </p>

        {/* CTAs */}
        <Row gap={3} justify="center" className="mt-10 flex-col sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">
              {t('ctaPrimary')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#simulator">
              <Sliders aria-hidden="true" />
              {t('ctaSecondary')}
            </a>
          </Button>
        </Row>

        {/* Trust signals — text-muted-foreground for AAA contrast (Q3 @cowork) */}
        <ul className="text-muted-foreground mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
          <li className="flex items-center gap-1.5">
            <Lock aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{t('trust.encrypted')}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <Shield aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{t('trust.noSale')}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <Globe aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{t('trust.languages')}</span>
          </li>
        </ul>
      </div>

      {/* Mockup — sits above the radial glow via z-10 wrapper */}
      <Glass padding="lg" className="relative z-10 mx-auto mt-16 max-w-5xl text-left">
        {/* Browser chrome */}
        <Row gap={2} className="mb-4">
          {HERO_BROWSER_DOTS.map((dot, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${dot.className}`}
            />
          ))}
          <Eyebrow className="ml-2 text-[10px] tracking-normal normal-case">
            {t('mockup.browserUrl')}
          </Eyebrow>
        </Row>

        <Eyebrow tone="accent" className="mb-4">
          {t('mockup.eyebrow')}
        </Eyebrow>

        {/* KPI cards */}
        <ul className="grid gap-4 md:grid-cols-3">
          {HERO_KPIS.map((kpi) => (
            <li key={kpi.key}>
              <Glass padding="md" className="bg-card/40">
                <Eyebrow>{t(`mockup.kpis.${kpi.key}.label`)}</Eyebrow>
                <Num size="xl" className={`mt-2 block ${kpi.toneClass}`}>
                  {kpi.display}
                </Num>
                <p className="text-muted mt-1.5 text-xs">{t(`mockup.kpis.${kpi.key}.sub`)}</p>
              </Glass>
            </li>
          ))}
        </ul>

        {/* Sparkline — currentColor inherited from text-brand-400 wrapper */}
        <div className="text-brand-400 mt-4">
          <svg
            viewBox={HERO_SPARKLINE.viewBox}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="block h-30 w-full"
          >
            <defs>
              <linearGradient id="ankora-hero-sparkline" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.4" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={HERO_SPARKLINE.areaPath} fill="url(#ankora-hero-sparkline)" />
            <path
              d={HERO_SPARKLINE.linePath}
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </Glass>
    </section>
  );
}
