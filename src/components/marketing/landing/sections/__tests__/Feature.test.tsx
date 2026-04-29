import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';
import { HERO_WATERFALL_DEMO } from '../../constants';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr-BE',
  getTranslations: async (namespace: string) => {
    const ns = messages as Record<string, unknown>;
    let cursor: unknown = ns;
    for (const part of namespace.split('.')) {
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return (key: string, params?: Record<string, string | number>) => {
      const parts = key.split('.');
      let value: unknown = cursor;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof value === 'string' && params) {
        return value.replace(/\{(\w+)\}/g, (_, k: string) =>
          k in params ? String(params[k]) : `{${k}}`,
        );
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

describe('<Feature /> — 3-step canonical waterfall', () => {
  it('renders the eyebrow + h3 split on 2 lines + description', async () => {
    await renderFeature();
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

  it('exposes the waterfall in a <figure> with a localised aria-label', async () => {
    const { container } = await renderFeature();
    const figure = container.querySelector('figure[aria-label]');
    expect(figure).not.toBeNull();
    expect(figure?.getAttribute('aria-label')).toContain('Cascade illustrative');
    expect(figure?.getAttribute('aria-label')).toContain('2 466 €');
    expect(figure?.getAttribute('aria-label')).toContain('507 €');
  });

  it('renders the 3 canonical steps in an <ol> (Revenus, Dépenses courantes, Argent disponible)', async () => {
    const { container } = await renderFeature();
    const list = container.querySelector('ol');
    expect(list).not.toBeNull();

    // Exactly 3 <li> children — connector arrows live INSIDE the second
    // and third <li>, not as standalone list items, so screen readers
    // announce a 3-item ordered sequence.
    const items = list!.querySelectorAll(':scope > li');
    expect(items.length).toBe(3);

    expect(within(list!).getByText('Revenus')).toBeInTheDocument();
    expect(within(list!).getByText('Dépenses courantes')).toBeInTheDocument();
    expect(within(list!).getByText('Argent disponible')).toBeInTheDocument();
  });

  it('renders the three step amounts with the correct sign + currency', async () => {
    await renderFeature();
    expect(screen.getByText('+2 466 €')).toBeInTheDocument();
    expect(screen.getByText('−1 959 €')).toBeInTheDocument();
    expect(screen.getByText('+507 €')).toBeInTheDocument();
  });

  it('renders the provisions sub-caption under the expenses step (FSMA-safe descriptive copy)', async () => {
    await renderFeature();
    const caption = screen.getByText(/lissés vers provisions affectées/i);
    expect(caption).toBeInTheDocument();
    expect(caption.textContent).toContain(String(HERO_WATERFALL_DEMO.provisions));
  });

  it('marks connector arrows as decorative SVG (not as list items)', async () => {
    const { container } = await renderFeature();
    const list = container.querySelector('ol');
    expect(list).not.toBeNull();
    // Connectors are SVG decorations inside step 2 and step 3 — never
    // standalone <li>, so the <ol> stays a clean 3-item ordered list.
    const decorativeSvgs = list!.querySelectorAll('svg[aria-hidden="true"]');
    expect(decorativeSvgs.length).toBe(2);
    // No <li> should be aria-hidden — they all carry semantic meaning.
    expect(list!.querySelectorAll('li[aria-hidden="true"]').length).toBe(0);
  });
});
