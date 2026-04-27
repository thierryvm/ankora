import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';

/**
 * FAQ — three question/answer pairs (advice, storage, sharing).
 *
 * Visual: token-only restyle of the previous inline FAQ block in
 * `page.tsx`. The associated FAQPage JSON-LD `<script>` is kept in
 * `page.tsx` because it must be emitted with the page-level CSP nonce
 * (alongside the SoftwareApplication JSON-LD) — same `FAQ_KEYS` source
 * of truth so the schema and the rendered list stay in lock-step.
 *
 * The `id="faq"` and `aria-labelledby="faq-heading"` are preserved so
 * deep links (e.g. `/#faq`) and the FAQPage schema both keep working.
 */

export const FAQ_KEYS = ['advice', 'storage', 'sharing'] as const;

export async function FAQ() {
  const t = await getTranslations('landing');

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mx-auto max-w-3xl px-4 py-20 md:px-6"
    >
      <h2
        id="faq-heading"
        className="font-display text-foreground mb-10 text-center text-3xl leading-tight font-semibold tracking-tight md:text-4xl"
      >
        {t('faqHeading')}
      </h2>
      <dl className="space-y-4">
        {FAQ_KEYS.map((key) => (
          <Card key={key}>
            <CardContent className="pt-6">
              <dt className="text-foreground mb-2 font-semibold">{t(`faq.${key}.q`)}</dt>
              <dd className="text-muted-foreground text-sm leading-relaxed text-pretty">
                {t(`faq.${key}.a`)}
              </dd>
            </CardContent>
          </Card>
        ))}
      </dl>
    </section>
  );
}
