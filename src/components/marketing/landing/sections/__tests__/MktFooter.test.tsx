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

vi.mock('@/components/brand/AnkoraLogo', () => ({
  AnkoraLogo: ({ className }: { className?: string }) => (
    <svg data-testid="ankora-logo" className={className} />
  ),
}));

import { MktFooter } from '../MktFooter';

async function renderMktFooter() {
  return render(await MktFooter());
}

describe('<MktFooter />', () => {
  it('renders the small mono logo + copyright line', async () => {
    await renderMktFooter();
    expect(screen.getByTestId('ankora-logo')).toBeInTheDocument();
    expect(screen.getByText(/éditeur ancré à Bruxelles/i)).toBeInTheDocument();
  });

  it('renders the 3 functional legal links pointing at the existing routes', async () => {
    await renderMktFooter();
    expect(screen.getByRole('link', { name: 'Conditions' })).toHaveAttribute('href', '/legal/cgu');
    expect(screen.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/');
  });

  it('renders Sécurité as disabled (page not built yet, issue #79)', async () => {
    await renderMktFooter();
    expect(screen.queryByRole('link', { name: 'Sécurité' })).not.toBeInTheDocument();
    const security = screen.getByText('Sécurité');
    expect(security.tagName).toBe('SPAN');
    expect(security).toHaveAttribute('aria-disabled', 'true');
    expect(security.className).toContain('cursor-not-allowed');
  });

  it('renders inside a <footer> landmark with a top border', async () => {
    const { container } = await renderMktFooter();
    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();
    expect(footer?.className).toContain('border-t');
  });
});
