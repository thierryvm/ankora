import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';

import { PiggyBank, Sliders, TrendingUp } from '../icons';

/**
 * Principles — three foundational ideas behind Ankora.
 *
 * Mirrors `Landing.jsx` cc-design `<Principles>` (lines 111-141):
 * - Eyebrow accent + h2 (font-display) + intro paragraph (max-w-3xl)
 * - 3 cards in a responsive grid:
 *   • PiggyBank   — "Provisions affectées"
 *   • TrendingUp  — "Réserve libre"
 *   • Sliders     — "Simulateur what-if"
 *
 * Each card: 44×44 rounded-xl icon container (brand-100 bg + brand-text
 * icon), title (font-sans 600 18px), description (text-muted-foreground).
 * Icon container colour comes from `--color-brand-100` / `--color-brand-text`
 * — both flip automatically under `[data-accent='admin']` to laiton without
 * touching this component.
 */
export async function Principles() {
  const t = await getTranslations('landing.principles');

  const items = [
    { key: 'provisions', Icon: PiggyBank },
    { key: 'reserve', Icon: TrendingUp },
    { key: 'whatIf', Icon: Sliders },
  ] as const;

  return (
    <section
      id="principles"
      aria-labelledby="principles-heading"
      className="mx-auto max-w-6xl px-4 py-20 md:px-6"
    >
      <div className="max-w-3xl">
        <Eyebrow tone="accent">{t('eyebrow')}</Eyebrow>
        <h2
          id="principles-heading"
          className="font-display text-foreground mt-3 text-3xl leading-tight font-semibold tracking-tight md:text-4xl"
        >
          {t('h2')}
        </h2>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed text-pretty md:text-lg">
          {t('description')}
        </p>
      </div>

      <ul className="mt-12 grid gap-5 md:grid-cols-3">
        {items.map(({ key, Icon }) => (
          <li key={key}>
            <Card className="h-full">
              <CardContent className="pt-6">
                <div className="bg-brand-surface text-brand-text mb-5 flex h-11 w-11 items-center justify-center rounded-xl">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </div>
                <h3 className="text-foreground text-lg font-semibold tracking-tight">
                  {t(`items.${key}.title`)}
                </h3>
                <p className="text-muted-foreground mt-2.5 text-sm leading-relaxed text-pretty">
                  {t(`items.${key}.description`)}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
