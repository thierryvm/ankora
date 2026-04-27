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

import { Principles } from '../Principles';

async function renderPrinciples() {
  return render(await Principles());
}

describe('<Principles />', () => {
  it('renders the eyebrow + h2 + intro paragraph', async () => {
    await renderPrinciples();
    expect(screen.getByText('Trois principes')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /honnête de parler d'argent/i }),
    ).toBeInTheDocument();
  });

  it('renders the 3 principles (Provisions affectées, Réserve libre, Simulateur what-if)', async () => {
    await renderPrinciples();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Provisions affectées' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Réserve libre' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Simulateur what-if' }),
    ).toBeInTheDocument();
  });

  it('renders icons as decorative (aria-hidden) so the SR reads only the headings', async () => {
    const { container } = await renderPrinciples();
    const icons = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(icons.length).toBe(3);
  });

  it('exposes the section as a named landmark via aria-labelledby="principles-heading"', async () => {
    await renderPrinciples();
    const section = screen.getByRole('heading', { level: 2 }).closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'principles-heading');
    expect(section).toHaveAttribute('id', 'principles');
  });
});
