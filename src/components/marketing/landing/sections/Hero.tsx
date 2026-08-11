import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Num } from '@/components/ui/num';
import { Row } from '@/components/ui/row';
import { Link } from '@/i18n/navigation';

import { ArrowRight, Globe, Lock, Shield, Sliders } from '../icons';

/**
 * Hero — public landing top-of-fold, « relevé corrigé » direction (PR L2).
 *
 * The thesis in one screen: your bank shows what already happened, Ankora
 * shows what is already committed. The centrepiece is a bank-statement card
 * that reads like the visitor's own statement — balance, two dated committed
 * amounts subtracted, a double rule, and the corrected figure.
 *
 * Deliberate constraints (ADR-039 + plan-reviewer arbitrations, 8 Aug 2026):
 * - Server Component, zero client JS, ZERO entrance animation. A resting
 *   state of opacity 0 makes an invisible hero the failure mode, and the
 *   direction says calm IS the argument. If a transition is ever wanted,
 *   `@starting-style` only (visible by default), justified by a Lighthouse
 *   measure.
 * - The payoff label « Encore vraiment à toi » is a descriptive phrase, NOT
 *   one of the four reserved cockpit names (ADR-035). The two figures are
 *   different formulas on purpose: this card shows statement balance minus
 *   dated commitments (a pedagogical object); the cockpit shows a real month.
 *   They agree on the thesis, never on the formula — do NOT "align" them.
 * - Anti-PSD2 on the card's FIRST line: a card showing a balance reads as
 *   "Ankora sees my account" unless it says the user typed it in.
 * - No colour coding on the amounts: neutral ink and the double rule do the
 *   work (same spirit as ADR-035 — never green, danger only when negative).
 * - All figures are illustrative, sourced from `RELEVE_DEMO` in constants.ts
 *   (arithmetic guarded by a unit test); display strings are pre-formatted
 *   per locale in the i18n bundles, following the waterfall pattern.
 */
export async function Hero() {
  const t = await getTranslations('landing.hero.releve');

  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto max-w-6xl px-4 pt-5 pb-14 md:px-6 md:pt-20 md:pb-20"
    >
      {/* Mobile vertical rhythm is measured, not felt: the card's payoff line
          must sit above the 664px fold (390×664, the real usable iPhone
          viewport). The 28px mobile H1 is the Fraunces display floor from the
          design-system skill — do not go below, do not grow without
          re-measuring the fold. */}
      <div className="grid gap-5 md:grid-cols-2 md:items-center md:gap-12">
        {/* Copy column */}
        <div>
          <Eyebrow className="text-accent-text">{t('kicker')}</Eyebrow>

          <h1
            id="hero-heading"
            className="font-display text-foreground mt-3 text-[1.75rem] leading-[1.15] font-semibold tracking-tight text-balance md:text-5xl"
          >
            <span className="block">{t('h1Bank')}</span>
            <span className="mt-1 block">
              {t('h1AnkoraLead')}{' '}
              <em className="text-accent-text font-display italic">{t('h1AnkoraEmphasis')}</em>
            </span>
          </h1>

          <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-relaxed text-pretty md:text-base">
            {t('subtitle')}
          </p>
        </div>

        {/* Statement card — the thesis, demonstrated on one screen */}
        <figure
          aria-label={t('card.ariaLabel')}
          data-testid="hero-releve-card"
          // shadow-md, not sm: on the paper page the white card sits at ~1.05:1
          // against the background and its border at ~1.27:1 (ui-auditor,
          // 9 Aug 2026) — the shadow IS the card's boundary, so it does the
          // work the border cannot. Accepted trade-off of the calm direction;
          // revisit the paper-line token (L1 territory) if this ever fails a
          // real-device check.
          className="bg-card border-border rounded-2xl border p-4 shadow-md md:p-6"
        >
          <dl className="text-sm">
            {/* Line 1 — the balance the visitor already knows, plus the
                anti-PSD2 note in the same breath */}
            {/* Every dt is a flex item, so it gets min-w-0: flex's default
                min-width:auto would refuse to shrink below the longest word
                and push the row past the card edge. break-words is the safety
                net behind it — min-w-0 alone cannot break a single unbreakable
                word. Today's FR/EN copy fits at 320px by arithmetic; the guard
                is for the copy nobody measured yet — German compounds, longer
                locales (mobile-ios-auditor, L2 + L3). */}
            <div className="flex items-baseline justify-between gap-4">
              <dt className="min-w-0 break-words">
                <span className="text-foreground font-medium">{t('card.title')}</span>
                <span className="text-muted-foreground mt-0.5 block max-w-[16rem] text-xs">
                  {t('card.titleNote')}
                </span>
              </dt>
              <dd>
                <Num size="md">{t('card.balanceAmount')}</Num>
              </dd>
            </div>

            {/* Dated commitments — what the bank balance silently promises */}
            <div className="border-border mt-3 flex items-baseline justify-between gap-4 border-t pt-3">
              <dt className="text-muted-foreground min-w-0 break-words">
                {t('card.insuranceLabel')}
              </dt>
              <dd>
                <Num size="md">{t('card.insuranceAmount')}</Num>
              </dd>
            </div>
            <div className="border-border mt-3 flex items-baseline justify-between gap-4 border-t pt-3">
              <dt className="text-muted-foreground min-w-0 break-words">{t('card.taxLabel')}</dt>
              <dd>
                <Num size="md">{t('card.taxAmount')}</Num>
              </dd>
            </div>

            {/* Double rule, then the corrected figure */}
            <div
              data-testid="hero-payoff"
              className="border-foreground/60 mt-3 flex items-baseline justify-between gap-4 border-t-[3px] border-double pt-3"
            >
              <dt className="min-w-0 break-words">
                <span className="text-foreground font-semibold">{t('card.payoffLabel')}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {t('card.payoffNote')}
                </span>
              </dt>
              <dd>
                <Num size="xl">{t('card.payoffAmount')}</Num>
              </dd>
            </div>
          </dl>

          <figcaption className="text-muted-foreground border-border mt-4 border-t pt-3 text-xs">
            {t('card.foot')}
          </figcaption>
        </figure>
      </div>

      {/* CTAs + trust line */}
      <Row gap={3} className="mt-8 flex-col sm:flex-row md:mt-12">
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

      <ul className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
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
    </section>
  );
}
