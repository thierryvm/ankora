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

import { FooterCTA } from '../FooterCTA';

async function renderFooterCTA() {
  return render(await FooterCTA());
}

describe('<FooterCTA />', () => {
  it('renders the H2 with lead + serif italic highlight on h2Highlight', async () => {
    await renderFooterCTA();
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toContain('Commence par ce qui est');
    expect(h2.textContent).toContain('déjà à toi.');
    const em = h2.querySelector('em');
    expect(em?.textContent).toBe('déjà à toi.');
  });

  it('renders the description with the FSMA-safe trial caveat', async () => {
    await renderFooterCTA();
    expect(screen.getByText(/30 jours d'essai/i)).toBeInTheDocument();
  });

  it('renders the primary CTA pointing at /signup', async () => {
    await renderFooterCTA();
    expect(screen.getByRole('link', { name: /ouvrir mon cockpit/i })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  it('exposes the section as a named landmark via aria-labelledby="footer-cta-heading"', async () => {
    await renderFooterCTA();
    const section = screen.getByRole('heading', { level: 2 }).closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'footer-cta-heading');
  });
});
