import { getLocale, getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Num } from '@/components/ui/num';
import { Link } from '@/i18n/navigation';

import { HERO_WATERFALL_DEMO } from '../constants';
import { ArrowRight } from '../icons';

/**
 * Inline SVG used as connector between successive waterfall steps.
 * Decorative — always rendered with `aria-hidden="true"` and no text content.
 * Lifted out of `<Feature>` so React tree-shaking can pick it up and to
 * keep the parent function pure (`react/no-unstable-nested-components`).
 */
function WaterfallArrowConnector() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="20"
      viewBox="0 0 14 20"
      fill="none"
      className="text-muted-foreground mx-auto"
    >
      <path
        d="M7 0 L7 16 M2 11 L7 16 L12 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Feature — Cashflow waterfall surface highlight (3 canonical steps).
 *
 * 3 canonical steps per `docs/design/claude-design-brief.md` L95 + L250
 * (*"salary → envelopes → expenses"*) and the coherence audit at
 * `Athenaeum/10_Projects/ankora/analysis/2026-04-28-waterfall-coherence-audit.md`.
 * See `cowork-handoffs/2026-04-28-2345-pr-3c-4-hero-waterfall-3steps.md`
 * for the full spec — this PR (PR-3c-4) realigned the waterfall away from
 * the cc-design 5-step mockup which over-represented provisions as a
 * primary siphon.
 *
 * Layout:
 * - LEFT: copy block (eyebrow accent, h3 split on 2 lines, paragraph, CTAs)
 * - RIGHT: 3-step ordered list (Revenus → Dépenses courantes → Argent
 *   disponible) with token-coloured amounts. Connector arrows live INSIDE
 *   the second and third `<li>` (above the step content) so the `<ol>`
 *   contains exactly 3 list items — screen readers announce a 3-item
 *   ordered sequence (not 5). The expenses step also carries a discreet
 *   sub-caption ("dont 59 € lissés vers provisions affectées") that
 *   surfaces the provisioning mechanism without elevating it to a
 *   standalone step.
 *
 * Numbers come from `HERO_WATERFALL_DEMO` (anchored on a real anonymised
 * user case — 2 466 € income, 1 959 € expenses, 507 € available). The
 * displayed strings are pre-formatted per-locale in the i18n bundles.
 *
 * Accessibility:
 * - The waterfall is wrapped in a `<figure>` with an `aria-label` that
 *   reads the full cascade in plain language for assistive tech.
 * - The step list uses `<ol>` so screen readers announce a 3-item
 *   ordered sequence. Connector arrows are pure SVG decorations marked
 *   `aria-hidden="true"` and live inside their step's `<li>`.
 * - Token-driven colours (`text-success`, `text-danger`, `text-brand-text-strong`)
 *   guarantee AA/AAA contrast across light + dark + admin accent flips.
 */
export async function Feature() {
  const t = await getTranslations('landing.feature');
  const tWaterfall = await getTranslations('landing.hero.waterfall');
  const locale = await getLocale();

  // Locale-aware formatter for the provisions sub-amount, which is the
  // one figure rendered dynamically (the three step amounts come straight
  // from i18n strings so designers can tweak punctuation per locale).
  const provisions = HERO_WATERFALL_DEMO.provisions.toLocaleString(locale);

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

        {/* RIGHT: 3-step waterfall */}
        <figure
          aria-label={tWaterfall('ariaLabel')}
          className="border-border bg-card/50 rounded-2xl border p-5"
        >
          <ol className="grid gap-0">
            {/* Step 1 — Income */}
            <li className="border-border bg-card/60 flex items-center justify-between rounded-xl border p-4">
              <span className="text-foreground text-sm font-medium">{tWaterfall('income')}</span>
              <Num size="md" className="text-success font-semibold">
                {tWaterfall('incomeAmount')}
              </Num>
            </li>

            {/* Step 2 — Expenses + provisions caption (arrow connector at top) */}
            <li className="grid gap-2">
              <WaterfallArrowConnector />
              <div className="border-border bg-card/60 grid gap-1.5 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-foreground text-sm font-medium">
                    {tWaterfall('expenses')}
                  </span>
                  <Num size="md" className="text-danger font-semibold">
                    {tWaterfall('expensesAmount')}
                  </Num>
                </div>
                <p className="text-muted-foreground pl-3 font-mono text-xs tabular-nums">
                  {tWaterfall('provisionsCaption', { amount: provisions })}
                </p>
              </div>
            </li>

            {/* Step 3 — Available (arrow connector at top) */}
            <li className="grid gap-2">
              <WaterfallArrowConnector />
              <div className="border-brand-surface-border bg-brand-surface flex items-center justify-between rounded-xl border p-4">
                <span className="text-foreground text-sm font-medium">
                  {tWaterfall('available')}
                </span>
                {/* All three step amounts use the same `<Num size>` + token-coloured
                    className pattern (`text-success`, `text-danger`, `text-brand-text-strong`)
                    so the visual semantic stays in sync across the cascade. The
                    `<Num tone>` prop only covers `default` / `accent` — success / danger
                    do not have prop equivalents, hence the className alignment. */}
                <Num size="md" className="text-brand-text-strong font-semibold">
                  {tWaterfall('availableAmount')}
                </Num>
              </div>
            </li>
          </ol>
        </figure>
      </div>
    </section>
  );
}
