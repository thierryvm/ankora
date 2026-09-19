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

  it('turns every cited source into a real https link', async () => {
    const { container } = await renderFor('fr-BE');
    const hrefs = [...container.querySelectorAll('a[rel~="noopener"]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual([
      'https://supabase.com/legal/customer-resources/data-processing-addendum',
      'https://supabase.com/legal/customer-resources/subprocessor-list',
      'https://supabase.com/privacy',
      'https://security.vercel.com',
      'https://vercel.com/legal/privacy-notice',
      'https://www.autoriteprotectiondonnees.be/citoyen/agir/introduire-une-plainte',
      'https://www.autoriteprotectiondonnees.be/citoyen/contact',
    ]);
    // The link text is the address itself: nothing between the tag and the URL.
    for (const a of container.querySelectorAll('a[rel~="noopener"]')) {
      expect(a.textContent).toBe(a.getAttribute('href'));
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

  it('says so, in their own language, where the policy is a copy', async () => {
    const expected: Record<string, RegExp | null> = {
      'fr-BE': null,
      en: null,
      'nl-BE': /alleen beschikbaar in het Frans en het Engels/,
      'de-DE': /nur auf Französisch und Englisch verfügbar/,
      'es-ES': /solo está disponible en francés y en inglés/,
    };
    for (const [l, re] of Object.entries(expected)) {
      const { container, unmount } = await renderFor(l);
      const notice = container.querySelector('h1 ~ p:not([class])');
      if (re) expect(container.textContent).toMatch(re);
      else expect(notice?.textContent ?? '').not.toMatch(/Frans|Englisch|inglés/);
      unmount();
    }
  });
});
