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

vi.mock('@/components/layout/HeaderNav', () => ({
  HeaderNav: ({ variant }: { variant: string }) => (
    <div data-testid="header-nav-mock" data-variant={variant} />
  ),
}));

vi.mock('@/components/brand/AnkoraLogo', () => ({
  AnkoraLogo: ({ className }: { className?: string }) => (
    <svg data-testid="ankora-logo" className={className} />
  ),
}));

import { MktNav } from '../MktNav';

async function renderMktNav() {
  const ui = await MktNav();
  return render(ui);
}

describe('<MktNav />', () => {
  it('renders the Ankora logo as the home link', async () => {
    await renderMktNav();
    const home = screen.getByLabelText('Accueil Ankora');
    expect(home).toHaveAttribute('href', '/');
    expect(screen.getByTestId('ankora-logo')).toBeInTheDocument();
  });

  it('renders the 3 active marketing nav links pointing at section anchors', async () => {
    await renderMktNav();
    expect(screen.getByRole('link', { name: 'Produit' })).toHaveAttribute('href', '#principles');
    expect(screen.getByRole('link', { name: 'Simulateur' })).toHaveAttribute('href', '#simulator');
    expect(screen.getByRole('link', { name: 'Tarifs' })).toHaveAttribute('href', '#pricing');
  });

  it('renders Sécurité + Journal as disabled spans (pages not built yet, issues #79 + #80)', async () => {
    await renderMktNav();
    // Not <a> — assistive tech announces them as disabled, not as navigation targets
    expect(screen.queryByRole('link', { name: 'Sécurité' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Journal' })).not.toBeInTheDocument();

    const security = screen.getByText('Sécurité');
    expect(security.tagName).toBe('SPAN');
    expect(security).toHaveAttribute('aria-disabled', 'true');
    expect(security.className).toContain('cursor-not-allowed');

    const journal = screen.getByText('Journal');
    expect(journal.tagName).toBe('SPAN');
    expect(journal).toHaveAttribute('aria-disabled', 'true');
    expect(journal.className).toContain('cursor-not-allowed');
  });

  it('renders the Login + Signup CTAs', async () => {
    await renderMktNav();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /essayer gratuitement/i })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  it('mounts the existing HeaderNav drawer for mobile parity', async () => {
    await renderMktNav();
    const drawer = screen.getByTestId('header-nav-mock');
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveAttribute('data-variant', 'marketing');
  });

  it('exposes the main navigation with a localised aria-label', async () => {
    await renderMktNav();
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
  });
});
