import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';

/**
 * Header is an async Server Component using `next-intl/server` and the
 * locale-aware Link from `@/i18n/navigation`. We mock both at module level
 * so we can render the resolved JSX directly under jsdom.
 */
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns = (messages as Record<string, Record<string, unknown>>)[namespace] ?? {};
    return (key: string) => {
      // Walk dot-separated keys like "nav.features"
      const parts = key.split('.');
      let value: unknown = ns;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key; // fallback to key for missing entries
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

vi.mock('../HeaderNav', () => ({
  HeaderNav: ({ variant }: { variant: string }) => (
    <div data-testid="header-nav-mock" data-variant={variant} />
  ),
}));

import { Header } from '../Header';

async function renderHeader(props: Parameters<typeof Header>[0] = {}) {
  const ui = await Header(props);
  return render(ui);
}

describe('<Header />', () => {
  it('renders the marketing variant by default with login + signup CTAs', async () => {
    await renderHeader();
    // Marketing nav links
    expect(screen.getByRole('link', { name: 'Fonctionnalités' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'FAQ' })).toBeInTheDocument();
    // Auth CTAs
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Créer un compte' })).toBeInTheDocument();
  });

  it('marketing variant + isAuthenticated shows the cockpit CTA instead of login/signup', async () => {
    await renderHeader({ variant: 'marketing', isAuthenticated: true });
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Créer un compte' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mon cockpit' })).toBeInTheDocument();
  });

  it('app variant shows the in-app navigation (dashboard, accounts, charges, settings)', async () => {
    await renderHeader({ variant: 'app', isAuthenticated: true });
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Comptes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Charges' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Paramètres' })).toBeInTheDocument();
  });

  it('home link points to / when unauthenticated, /app when authenticated', async () => {
    const { unmount } = await renderHeader({ variant: 'marketing', isAuthenticated: false });
    expect(screen.getByLabelText('Accueil Ankora')).toHaveAttribute('href', '/');
    unmount();

    await renderHeader({ variant: 'marketing', isAuthenticated: true });
    expect(screen.getByLabelText('Accueil Ankora')).toHaveAttribute('href', '/app');
  });
});
