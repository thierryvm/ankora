import { getLocale, getTranslations } from 'next-intl/server';

import { Glass } from '@/components/ui/glass';
import { Sliders } from '@/components/marketing/landing/icons';

import { WhatIfDemoClient } from './WhatIfDemoClient';

/**
 * WhatIfDemo — public landing simulator (PR-3c-3, last of the PR-3c series).
 *
 * Mirrors `Landing.jsx` cc-design `<WhatIfDemo>` (lines 182-364) and
 * implements the UX/copy improvements validated 2026-04-28
 * (`docs/design/copywriting-review-2026-04-28.md` §5).
 *
 * Server-side responsibilities:
 * - Fetches the section header copy (badge / title / subtitle) via
 *   `getTranslations` so SSR + crawlers see the static text.
 * - Hosts the `<Glass>` wrapper that lays out the 2-column grid.
 * - Anchors `id="simulator"` (referenced by MktNav and the Hero secondary CTA).
 *
 * Interactivity (slider, scenario buttons, animated SVG paths) lives in the
 * inner `<WhatIfDemoClient />` Client Component — kept as small as possible so
 * the rest of the section ships as static HTML.
 */
/**
 * Les six mois de l'axe, à partir du mois courant.
 *
 * Ils étaient FIGÉS à « mai … oct » dans six clés de traduction, sous un
 * sous-titre qui annonce « 6 mois à partir d'aujourd'hui ». Relevé le 11 août
 * 2026 : le graphique montrait une fenêtre à moitié passée, et en décembre elle
 * l'aurait été entièrement. Les chiffres de cette démo sont explicitement
 * hypothétiques ; la DATE, elle, était une affirmation, et elle était fausse
 * dix mois sur douze.
 *
 * Calculés côté serveur et passés en props : les calculer dans le composant
 * client produirait une divergence d'hydratation au passage de minuit, et
 * `Intl` les traduit sans qu'aucune clé n'ait à exister.
 */
function moisAVenir(locale: string, depuis: Date): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: 'short' });
  return Array.from({ length: 6 }, (_, i) =>
    format.format(new Date(depuis.getFullYear(), depuis.getMonth() + i, 1)),
  );
}

export async function WhatIfDemo() {
  const t = await getTranslations('landing.whatif');
  const locale = await getLocale();
  const mois = moisAVenir(locale, new Date());

  return (
    <section
      id="simulator"
      aria-labelledby="whatif-heading"
      className="mx-auto max-w-6xl px-4 pt-20 pb-12 md:px-6"
    >
      <header className="mx-auto mb-10 max-w-2xl text-center">
        <span className="bg-brand-surface border-brand-surface-border text-brand-text-strong mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
          <Sliders aria-hidden="true" className="h-3 w-3" />
          {t('badge')}
        </span>
        <h2
          id="whatif-heading"
          className="font-display text-foreground text-4xl leading-tight font-semibold tracking-tight text-balance md:text-5xl"
        >
          {t('title')}
        </h2>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base leading-relaxed text-pretty">
          {t('subtitle')}
        </p>
      </header>

      <Glass
        padding="none"
        className="mx-auto grid max-w-5xl overflow-hidden md:grid-cols-[1fr_1.05fr]"
      >
        <WhatIfDemoClient mois={mois} />
      </Glass>
    </section>
  );
}

/**
 * Re-export to keep import paths consistent with the other landing sections
 * which use `import { Section } from '.../sections/Section'`.
 */
export default WhatIfDemo;
