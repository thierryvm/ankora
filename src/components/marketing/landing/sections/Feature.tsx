import { getLocale, getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Num } from '@/components/ui/num';

import { FEATURE_WATERFALL_DEMO } from '../constants';
import { ArrowRight } from '../icons';

/**
 * Feature — the cashflow cascade, restyled as a statement (PR L3).
 *
 * 3 canonical steps per `docs/design/claude-design-brief.md` L95 + L250
 * (*"salary → envelopes → expenses"*) and the coherence audit at
 * `Athenaeum/10_Projects/ankora/analysis/2026-04-28-waterfall-coherence-audit.md`
 * — the 3-step model itself is unchanged since PR-3c-4.
 *
 * What PR L3 changed, and why:
 * - The cascade adopts the hero statement-card grammar (« relevé corrigé »
 *   direction, ADR-039): white card on paper, rows separated by rules, a
 *   double rule before the bottom line. The SVG arrow connectors are gone —
 *   the rules and the reading order do their work; arrows belonged to the
 *   old dashboard-mockup grammar.
 * - Amounts are neutral ink. The previous success/danger/brand colouring was
 *   REDUNDANT with the sign already carried by the i18n strings ("+2 466 €",
 *   "−1 959 €"), and colour as the only carrier is a WCAG 1.4.1 defect. Same
 *   doctrine as the hero card and ADR-035 §3 (never green; the sign does the
 *   work). The sign is pinned per-bundle by `constants.test.ts`.
 * - The heading is an `<h2>`: this section's main heading was an `<h3>` with
 *   no `<h2>` above it in the section — an orphan in the page outline
 *   (WCAG 1.3.1, flagged by ui-auditor on PR L2).
 * - i18n moved to `landing.feature.waterfall.*` (the cascade stopped living
 *   in the hero at L2; the namespace now says where the copy renders).
 *
 * Accessibility: the cascade stays a `<figure>` with a plain-language
 * aria-label, and the step list stays an `<ol>` of exactly 3 items so screen
 * readers announce a 3-item ordered sequence.
 *
 * Numbers come from `FEATURE_WATERFALL_DEMO` (anchored on a real anonymised
 * user case); display strings are pre-formatted per locale in the bundles.
 */
export async function Feature() {
  const t = await getTranslations('landing.feature');
  const tWaterfall = await getTranslations('landing.feature.waterfall');
  const locale = await getLocale();

  // Locale-aware formatter for the provisions sub-amount, the one figure
  // rendered dynamically (the three step amounts come straight from i18n
  // strings so designers can tweak punctuation per locale).
  const provisions = FEATURE_WATERFALL_DEMO.provisions.toLocaleString(locale);

  return (
    <section
      id="feature"
      aria-labelledby="feature-heading"
      className="mx-auto max-w-6xl px-4 py-16 md:px-6"
    >
      <div className="grid gap-8 md:grid-cols-2 md:items-center md:gap-12">
        {/* LEFT: copy + CTAs */}
        <div>
          <Eyebrow tone="accent">{t('eyebrow')}</Eyebrow>
          <h2
            id="feature-heading"
            className="font-display text-foreground mt-3 text-3xl leading-tight font-semibold tracking-tight md:text-4xl"
          >
            {t('titleLine1')}
            <br />
            {t('titleLine2')}
          </h2>
          <p className="text-muted-foreground mt-4 text-base leading-relaxed text-pretty">
            {t('description')}
          </p>
          {/* min-h-11 on both CTAs: they measured 36px under size="sm",
              below the 44px target this repo imposes on itself everywhere
              else (same fix as the MktFooter links). Kept size="sm" for the
              visual weight — only the hit area grows. */}
          {/* Les deux liens pointaient au mauvais endroit. « Voir un exemple »
              menait à /signup — donc un formulaire d'inscription pour un
              visiteur, et le cockpit pour quelqu'un de connecté
              (`redirectIfSignedIn`) : jamais un exemple, alors que l'exemple
              est la carte affichée juste à droite. Et « Comment ça marche ? »
              renvoyait vers #principles, une section DÉJÀ dépassée par le
              lecteur.
              Les deux avancent désormais : le simulateur est la section
              suivante et ne demande pas de compte, la FAQ vient après. */}
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button asChild size="sm" className="min-h-11">
              <a href="#simulator">
                {t('ctaPrimary')}
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" className="min-h-11">
              <a href="#faq">{t('ctaSecondary')}</a>
            </Button>
          </div>
        </div>

        {/* RIGHT: the cascade as a statement */}
        <figure
          aria-label={tWaterfall('ariaLabel')}
          data-testid="feature-waterfall-card"
          // shadow-md, not sm: on the paper page a white card sits at ~1.05:1
          // against the background — the shadow IS the card's boundary (same
          // measured trade-off as the hero card, ui-auditor 9 Aug 2026).
          className="bg-card border-border rounded-2xl border p-4 shadow-md md:p-6"
        >
          <ol className="text-sm">
            {/* Step 1 — Income */}
            <li className="flex items-baseline justify-between gap-4">
              {/* Labels are flex items: min-w-0 lets the label shrink, and
                  break-words is the safety net behind it — min-w-0 alone
                  cannot break a single unbreakable word (German compounds at
                  DE activation). Same guard family as the hero card's dt
                  (mobile-ios-auditor, L2 + L3). */}
              <span className="text-foreground min-w-0 font-medium break-words">
                {tWaterfall('income')}
              </span>
              <Num size="md">{tWaterfall('incomeAmount')}</Num>
            </li>

            {/* Step 2 — Expenses, with the provisions caption + definition */}
            <li className="border-border mt-3 border-t pt-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-foreground min-w-0 font-medium break-words">
                  {tWaterfall('expenses')}
                </span>
                <Num size="md">{tWaterfall('expensesAmount')}</Num>
              </div>
              <p className="text-muted-foreground mt-1.5 text-xs">
                {tWaterfall('provisionsCaption', { amount: provisions })}
              </p>
              {/* "Provisions" explained at first contact (plan-cadre §L3.2):
                  a definition in plain language, descriptive only (FSMA). */}
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {tWaterfall('provisionsDefinition')}
              </p>
            </li>

            {/* Step 3 — Available, under the double rule (the statement's
                bottom line, same grammar as the hero payoff row) */}
            <li className="border-foreground/60 mt-3 flex items-baseline justify-between gap-4 border-t-[3px] border-double pt-3">
              <span className="text-foreground min-w-0 font-semibold break-words">
                {tWaterfall('available')}
              </span>
              <Num size="lg">{tWaterfall('availableAmount')}</Num>
            </li>
          </ol>
        </figure>
      </div>
    </section>
  );
}
