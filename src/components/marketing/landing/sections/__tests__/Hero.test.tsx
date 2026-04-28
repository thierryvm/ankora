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

async function renderHero() {
  const ui = await Hero();
  return render(ui);
}

describe('<Hero />', () => {
  it('renders the H1 with lead + serif italic highlight', async () => {
    await renderHero();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain('Ton ancrage');
    expect(h1.textContent).toContain('financier.');
    // Highlight is wrapped in an <em> so it can be styled italic + tinted
    const em = h1.querySelector('em');
    expect(em?.textContent).toBe('financier.');
  });

  it('renders the badge with cc-design copy', async () => {
    await renderHero();
    expect(screen.getByText(/Nouveau · Simulateur what-if/i)).toBeInTheDocument();
  });

  it('renders the two CTAs pointing at /signup and #simulator', async () => {
    await renderHero();
    expect(screen.getByRole('link', { name: /ouvrir mon cockpit/i })).toHaveAttribute(
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
    expect(screen.getByText(/Données chiffrées en Belgique/i)).toBeInTheDocument();
    expect(screen.getByText(/Aucune vente de données/i)).toBeInTheDocument();
    expect(screen.getByText(/FR · NL · EN/i)).toBeInTheDocument();
  });

  it('renders the mockup eyebrow "Aperçu cockpit" (illustratives KPIs disclaimer)', async () => {
    await renderHero();
    expect(screen.getByText(/Aperçu cockpit/i)).toBeInTheDocument();
  });

  it('renders the 3 KPI cards with localised labels, display values and AA tone classes', async () => {
    await renderHero();

    // Tone classes upgraded from sub-AA decoratives (text-success-300/
    // accent-400/brand-300) to AA semantic-text tokens after axe-core
    // flagged the contrast on PR #78. Same family, proper contrast.
    expect(screen.getByText('Net restant')).toBeInTheDocument();
    const netRemaining = screen.getByText('480 €');
    expect(netRemaining.className).toContain('text-success');

    expect(screen.getByText('Provisions')).toBeInTheDocument();
    const provisions = screen.getByText('1 660 €');
    expect(provisions.className).toContain('text-accent-text');

    expect(screen.getByText('Réserve')).toBeInTheDocument();
    const reserve = screen.getByText('614 €');
    expect(reserve.className).toContain('text-brand-text-strong');
  });

  it('renders the decorative radial glow as aria-hidden with an inline radial-gradient', async () => {
    await renderHero();
    const glow = screen.getByTestId('hero-radial-glow');
    expect(glow).toHaveAttribute('aria-hidden', 'true');
    // Inline style guarantees the gradient renders even if a class-based
    // background were ever overridden by a Tailwind utility.
    expect(glow.style.background).toContain('radial-gradient');
    expect(glow.style.background).toContain('var(--color-brand-400)');
  });

  it('exposes the section as a named landmark via aria-labelledby="hero-heading"', async () => {
    await renderHero();
    const section = screen.getByRole('heading', { level: 1 }).closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'hero-heading');
  });

  it("exposes the sparkline as decorative (aria-hidden) so it doesn't pollute the SR tree", async () => {
    const { container } = await renderHero();
    const svg = container.querySelector('svg[aria-hidden="true"]');
    expect(svg).not.toBeNull();
  });

  it('renders the browser-chrome URL eyebrow next to the dots', async () => {
    await renderHero();
    expect(screen.getByText('Ankora · cockpit')).toBeInTheDocument();
  });

  it('renders KPIs inside an unordered list for assistive tech', async () => {
    await renderHero();
    const lists = screen.getAllByRole('list');
    // First list = trust signals (3 items), second list = KPI cards (3 items)
    const kpiList = lists.find((ul) => within(ul).queryByText('Net restant'));
    expect(kpiList).toBeDefined();
    expect(within(kpiList!).getAllByRole('listitem')).toHaveLength(3);
  });
});
