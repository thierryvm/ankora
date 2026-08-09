import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns = messages as Record<string, unknown>;
    let cursor: unknown = ns;
    for (const part of namespace.split('.')) {
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return (key: string) => {
      const parts = key.split('.');
      let value: unknown = cursor;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    };
  },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { Hero } from '../Hero';

// NBSP-separated amounts, exactly as the fr-BE bundle formats them. Spelled
// with escapes so a regular space smuggled into the copy fails loudly here
// instead of rendering a subtly wrong statement.
const FR_BALANCE = '1 240,00 €';
const FR_INSURANCE = '− 280,00 €';
const FR_TAX = '− 162,00 €';
const FR_PAYOFF = '798,00 €';

async function renderHero() {
  const ui = await Hero();
  return render(ui);
}

describe('<Hero /> — « relevé corrigé » (PR L2)', () => {
  it('renders the two-sentence H1 with the italic emphasis on the key term', async () => {
    await renderHero();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain("Ta banque te montre ce qui s'est passé.");
    expect(h1.textContent).toContain('Ankora te montre ce qui est');
    // The key term is wrapped in an <em> so it can be styled italic + laiton
    const em = h1.querySelector('em');
    expect(em?.textContent).toBe('déjà engagé.');
  });

  it('exposes the section as a named landmark via aria-labelledby="hero-heading"', async () => {
    await renderHero();
    const section = screen.getByRole('heading', { level: 1 }).closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'hero-heading');
  });

  it('renders the statement card as a figure with a plain-language aria-label', async () => {
    await renderHero();
    const card = screen.getByTestId('hero-releve-card');
    expect(card.tagName).toBe('FIGURE');
    expect(card).toHaveAttribute('aria-label', expect.stringContaining('Relevé illustratif'));
  });

  it('opens the card on the anti-PSD2 line: balance typed by the user, no bank connection', async () => {
    await renderHero();
    expect(screen.getByText('Le solde que tu lis à ta banque')).toBeInTheDocument();
    // The reassurance lives ON the card's first line (ADR-039), not only in
    // some footer — a card showing a balance otherwise reads as "Ankora sees
    // my account".
    expect(screen.getByText(/ne se connecte à aucune banque/i)).toBeInTheDocument();
  });

  it('renders the four statement amounts, in order, with NBSP separators and U+2212 minus', async () => {
    await renderHero();
    // Raw textContent, NOT getByText: testing-library's normalizer collapses
    // NBSP into a regular space, so a query would pass with either character
    // — and the NBSP typography is exactly what this assertion pins.
    const card = screen.getByTestId('hero-releve-card');
    const amounts = Array.from(card.querySelectorAll('dd')).map((dd) => dd.textContent);
    expect(amounts).toEqual([FR_BALANCE, FR_INSURANCE, FR_TAX, FR_PAYOFF]);
  });

  it('renders the dated commitments — the dates are the argument', async () => {
    await renderHero();
    expect(screen.getByText(/Assurance auto · prélevée le 15/)).toBeInTheDocument();
    expect(screen.getByText(/Taxe de circulation · novembre/)).toBeInTheDocument();
  });

  it('labels the payoff « Encore vraiment à toi » and NEVER one of the four cockpit names', async () => {
    await renderHero();
    const payoff = screen.getByTestId('hero-payoff');
    expect(within(payoff).getByText('Encore vraiment à toi')).toBeInTheDocument();
    expect(
      within(payoff).getByText(/une fois l'assurance et la taxe comptées/),
    ).toBeInTheDocument();
    // ADR-039 §vocabulaire: the landing figure is `statement balance − dated
    // commitments`, a pedagogical object — NOT the cockpit's « Il te reste »
    // (`resteDisponible − depensesDuMois`). A future edit that "aligns" the
    // two labels would silently promise a formula this card does not compute.
    expect(screen.queryByText(/Il te reste/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Budget du mois/i)).not.toBeInTheDocument();
  });

  it('marks the whole card as an illustrative example with user-entered figures', async () => {
    await renderHero();
    expect(screen.getByText(/Exemple illustratif/)).toBeInTheDocument();
    expect(screen.getByText(/saisis par toi/)).toBeInTheDocument();
  });

  it('renders the two CTAs pointing at /signup and #simulator', async () => {
    await renderHero();
    expect(screen.getByRole('link', { name: /créer mon compte/i })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(screen.getByRole('link', { name: /voir le simulateur/i })).toHaveAttribute(
      'href',
      '#simulator',
    );
  });

  it('renders the 3 trust signals (encrypted / no sale / languages)', async () => {
    await renderHero();
    expect(screen.getByText(/hébergées dans l'Union européenne/i)).toBeInTheDocument();
    expect(screen.getByText(/Aucune vente de données/i)).toBeInTheDocument();
    // This suite once asserted « Données chiffrées en Belgique » — a FALSE
    // claim (the privacy policy itself names Supabase Frankfurt/Paris, Vercel
    // Dublin, Upstash EU). The negative assertion is the real guard: it fails
    // if anyone reintroduces the wording. Kept verbatim across the rewrite.
    expect(screen.queryByText(/en Belgique/i)).not.toBeInTheDocument();
    // THI-266 / PR-BETA-2: public-facing locale list stays FR + EN for v1.0.
    expect(screen.getByText(/FR · EN/i)).toBeInTheDocument();
  });

  it('has ZERO entrance animation — no opacity-0 resting state, no animate-* class', async () => {
    // Plan-reviewer arbitration (8 Aug 2026): an opacity-0 resting state makes
    // an invisible hero the failure mode, and the direction says calm IS the
    // argument. If a transition is ever wanted: @starting-style only, with a
    // Lighthouse before/after measure.
    const { container } = await renderHero();
    expect(container.innerHTML).not.toMatch(/opacity-0|animate-/);
  });

  it('structures the statement as a definition list (4 label/amount rows)', async () => {
    const { container } = await renderHero();
    const dl = container.querySelector('dl');
    expect(dl).not.toBeNull();
    expect(dl!.querySelectorAll('dt')).toHaveLength(4);
    expect(dl!.querySelectorAll('dd')).toHaveLength(4);
  });
});
