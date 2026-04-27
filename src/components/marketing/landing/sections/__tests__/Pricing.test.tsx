import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

import { Pricing } from '../Pricing';

async function renderPricing() {
  return render(await Pricing());
}

describe('<Pricing />', () => {
  it('renders the eyebrow + h2 (Phase 1 gratuit) + phase badge', async () => {
    await renderPricing();
    expect(screen.getByText('Transparent dès le départ')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /gratuit pendant la phase 1/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/PHASE 1 · CONSTRUCTION/i)).toBeInTheDocument();
  });

  it('renders the 0 € price + period caption', async () => {
    await renderPricing();
    expect(screen.getByText('0 €')).toBeInTheDocument();
    expect(screen.getByText(/sans date limite/i)).toBeInTheDocument();
  });

  it('renders the 4 features with Check icons (aria-hidden)', async () => {
    const { container } = await renderPricing();
    expect(screen.getByText(/Cockpit complet/i)).toBeInTheDocument();
    expect(screen.getByText(/Simulateur what-if illimité/i)).toBeInTheDocument();
    expect(screen.getByText(/Saisie manuelle/i)).toBeInTheDocument();
    // "Export RGPD" appears twice (body paragraph + features list);
    // the feature-list copy is the disambiguating one ("en un clic").
    expect(screen.getByText(/Export RGPD en un clic/i)).toBeInTheDocument();
    // 1 anchor SVG (decorative bg) + 4 Check icons + 1 Sparkles (roadmap) = 6 aria-hidden
    const decorative = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(decorative.length).toBeGreaterThanOrEqual(5);
  });

  it('renders the primary CTA pointing at /signup', async () => {
    await renderPricing();
    expect(screen.getByRole('link', { name: /ouvrir mon cockpit/i })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  it('renders the roadmap note as a separate <aside> with a labelled title', async () => {
    await renderPricing();
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('aria-labelledby', 'pricing-roadmap-title');
    expect(screen.getByText(/tu rejoins ankora pendant sa phase 1/i)).toBeInTheDocument();
  });

  it('exposes the pricing section as a named landmark via aria-labelledby', async () => {
    await renderPricing();
    const section = screen.getByRole('heading', { level: 2 }).closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'pricing-heading');
    expect(section).toHaveAttribute('id', 'pricing');
  });
});
