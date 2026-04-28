import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';
import { WATERFALL_BARS } from '../../constants';

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

import { Feature } from '../Feature';

async function renderFeature() {
  return render(await Feature());
}

describe('<Feature />', () => {
  it('renders the eyebrow + h3 split on 2 lines + description', async () => {
    await renderFeature();
    // "Cashflow waterfall" appears in two places: the visible Eyebrow <p>
    // and the SVG <title> (a11y label). The eyebrow is the visible one.
    expect(screen.getByText('Cashflow waterfall', { selector: 'p' })).toBeInTheDocument();
    const h3 = screen.getByRole('heading', { level: 3 });
    expect(h3.textContent).toContain('Du salaire au net disponible.');
    expect(h3.textContent).toContain("En un seul coup d'œil.");
  });

  it('renders the 2 CTAs pointing at /signup and #principles', async () => {
    await renderFeature();
    expect(screen.getByRole('link', { name: /voir un exemple/i })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(screen.getByRole('link', { name: /comment ça marche/i })).toHaveAttribute(
      'href',
      '#principles',
    );
  });

  it('renders a 5-bar SVG waterfall (one rect per WATERFALL_BARS entry)', async () => {
    const { container } = await renderFeature();
    const rects = container.querySelectorAll('svg rect');
    expect(rects.length).toBe(WATERFALL_BARS.length);
  });

  it('renders one localised bar label per bar (Revenus, Provisions, Dépenses courantes, Réserve, Argent disponible)', async () => {
    const { container } = await renderFeature();
    const labels = container.querySelectorAll('svg text');
    // 5 value labels (top of bar) + 5 axis labels (below) = 10 text nodes
    expect(labels.length).toBe(WATERFALL_BARS.length * 2);
  });

  it('exposes the SVG as role="img" with a localised <title> for screen readers', async () => {
    const { container } = await renderFeature();
    const svg = container.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('title')?.textContent).toBe('Cashflow waterfall');
  });
});
