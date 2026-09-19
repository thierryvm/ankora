import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import frBE from '../../../../../../../messages/fr-BE.json';
import en from '../../../../../../../messages/en.json';
import nlBE from '../../../../../../../messages/nl-BE.json';
import deDE from '../../../../../../../messages/de-DE.json';
import esES from '../../../../../../../messages/es-ES.json';
import { brand } from '@/lib/brand';

/**
 * The privacy policy is composed on publiable.dev and carried word for word.
 * What this file pins is that the page SHOWS it: every section of the
 * document, the sources as real links, the contact address from `brand.ts`,
 * and none of the sentence the document proved false (« aucune donnée n'est
 * transférée hors UE/EEE » — Supabase and Vercel both transfer, on stated
 * bases).
 */

const { locale } = vi.hoisted(() => ({ locale: { current: 'fr-BE' } }));
const ALL: Record<string, typeof frBE> = {
  'fr-BE': frBE,
  en,
  'nl-BE': nlBE,
  'de-DE': deDE,
  'es-ES': esES,
};

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: locale.current as 'fr-BE',
      messages: ALL[locale.current],
      namespace: namespace as 'legal',
    }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }));

import PrivacyPage from '../page';

async function renderFor(l: string) {
  locale.current = l;
  return render(await PrivacyPage());
}

const SOURCES = [
  'https://supabase.com/legal/customer-resources/data-processing-addendum',
  'https://supabase.com/legal/customer-resources/subprocessor-list',
  'https://supabase.com/privacy',
  'https://security.vercel.com',
  'https://vercel.com/legal/privacy-notice',
  'https://www.autoriteprotectiondonnees.be/citoyen/agir/introduire-une-plainte',
  'https://www.autoriteprotectiondonnees.be/citoyen/contact',
];

describe('privacy policy page — the Publiable document, as published', () => {
  it('renders the five sections of the document, then the publisher complements', async () => {
    await renderFor('fr-BE');
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual([
      'Responsable du traitement',
      'Données collectées',
      'Vos droits',
      "Votre droit d'opposition",
      'Réclamation',
      "Compléments de l'éditeur",
    ]);
    const h3 = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(h3).toContain('Supabase — base de données');
    expect(h3).toContain("Vercel Web Analytics — mesure d'audience");
    expect(h3).toContain('Google (connexion avec un compte Google) — authentification');
  });

  it('names only the top-level sections as regions', async () => {
    await renderFor('fr-BE');
    expect(screen.getAllByRole('region')).toHaveLength(6);
  });

  it('turns every cited source into a real https link, in every locale', async () => {
    for (const l of Object.keys(ALL)) {
      const { container, unmount } = await renderFor(l);
      const links = [...container.querySelectorAll('a[href^="https://"]')];
      expect(links.map((a) => a.getAttribute('href'))).toEqual(SOURCES);
      // The link text is the address itself: nothing between the tag and the URL.
      for (const a of links) expect(a.textContent).toBe(a.getAttribute('href'));
      // And the cookie policy is reachable from the complements.
      expect(container.querySelector('a[href="/legal/cookies"]')).not.toBeNull();
      unmount();
    }
  });

  it('gives the contact address of brand.ts, as a mailto link', async () => {
    const { container } = await renderFor('fr-BE');
    const mail = container.querySelector('a[href^="mailto:"]');
    expect(mail?.getAttribute('href')).toBe(`mailto:${brand.privacyEmail}`);
    expect(mail?.textContent).toBe(brand.privacyEmail);
  });

  it('no longer claims that no data leaves the EU', async () => {
    for (const l of Object.keys(ALL)) {
      const { container, unmount } = await renderFor(l);
      expect(container.textContent).not.toMatch(/hors UE\/EEE|outside the EU\/EEA/i);
      expect(container.textContent).toMatch(/2021\/914/);
      unmount();
    }
  });

  it('says so, in its own language, where the locale carries a copy — and marks the copy', async () => {
    const expected: Record<string, { notice: RegExp | null; lang: string | null }> = {
      'fr-BE': { notice: null, lang: null },
      en: { notice: null, lang: null },
      'nl-BE': { notice: /^Dit beleid is voorlopig alleen beschikbaar/, lang: 'fr' },
      'de-DE': { notice: /^Diese Richtlinie ist vorerst nur/, lang: 'en' },
      'es-ES': { notice: /^Por ahora, esta política solo está disponible/, lang: 'en' },
    };
    for (const [l, { notice, lang }] of Object.entries(expected)) {
      const { container, unmount } = await renderFor(l);
      // The paragraphs between the title and the first section: the notice
      // (when there is one) then the intro. `ProseMeta` carries a class.
      const lead = [...container.querySelectorAll('h1 ~ p:not([class])')].filter(
        (p) => !p.closest('section'),
      );
      if (notice) {
        expect(lead).toHaveLength(2);
        expect(lead[0]!.textContent).toMatch(notice);
        expect(lead[0]!.getAttribute('lang')).toBeNull();
      } else {
        expect(lead).toHaveLength(1);
      }
      const h1 = container.querySelector('h1');
      expect(h1?.getAttribute('lang')).toBe(lang);
      for (const section of container.querySelectorAll('section')) {
        expect(section.getAttribute('lang')).toBe(lang);
      }
      unmount();
    }
  });
});
