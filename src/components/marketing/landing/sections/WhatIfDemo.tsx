import { getTranslations } from 'next-intl/server';

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
export async function WhatIfDemo() {
  const t = await getTranslations('landing.whatif');

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
        <WhatIfDemoClient />
      </Glass>
    </section>
  );
}

/**
 * Re-export to keep import paths consistent with the other landing sections
 * which use `import { Section } from '.../sections/Section'`.
 */
export default WhatIfDemo;
