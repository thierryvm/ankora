import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import frMessages from '../../../../messages/fr-BE.json';

/**
 * HeaderNav is a Client Component with a mobile drawer that shows different
 * auth CTAs based on the `isAuthenticated` prop. We mock next-intl and the
 * locale-aware Link / LocaleSwitcher so the drawer can be rendered + opened
 * under jsdom without a real next-intl provider.
 */

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    return (key: string) => {
      const ns = (frMessages as Record<string, Record<string, unknown>>)[namespace.split('.')[0]!];
      const parts = namespace.split('.').slice(1);
      let value: unknown = ns;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        }
      }
      const keyParts = key.split('.');
      for (const part of keyParts) {
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

vi.mock('../LocaleSwitcher', () => ({
  LocaleSwitcher: () => <div data-testid="locale-switcher-mock" />,
}));

import { HeaderNav } from '../HeaderNav';

beforeEach(() => {
  cleanup();
});

async function openDrawer(): Promise<void> {
  const user = userEvent.setup();
  // The hamburger button shares the menu aria-label.
  const trigger = screen.getByRole('button', { name: 'Menu' });
  await user.click(trigger);
}

describe('<HeaderNav /> mobile drawer — auth CTAs', () => {
  it('marketing variant + anonymous shows login + signup links in the drawer', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated={false} />);
    await openDrawer();

    expect(screen.getByTestId('drawer-login-link')).toHaveAttribute('href', '/login');
    expect(screen.getByTestId('drawer-signup-link')).toHaveAttribute('href', '/signup');
    expect(screen.queryByTestId('drawer-cockpit-link')).not.toBeInTheDocument();
  });

  it('marketing variant + authenticated shows the "Mon cockpit" link instead', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated />);
    await openDrawer();

    const cockpit = screen.getByTestId('drawer-cockpit-link');
    expect(cockpit).toHaveAttribute('href', '/app');
    expect(cockpit).toHaveTextContent('Mon cockpit');
    expect(screen.queryByTestId('drawer-login-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drawer-signup-link')).not.toBeInTheDocument();
  });

  it('marketing variant defaults to anonymous (no isAuthenticated prop)', async () => {
    render(<HeaderNav variant="marketing" />);
    await openDrawer();

    expect(screen.getByTestId('drawer-login-link')).toBeInTheDocument();
    expect(screen.queryByTestId('drawer-cockpit-link')).not.toBeInTheDocument();
  });

  it('app variant ignores isAuthenticated — drawer shows the in-app nav, not auth CTAs', async () => {
    render(<HeaderNav variant="app" isAuthenticated />);
    await openDrawer();

    expect(screen.queryByTestId('drawer-login-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drawer-signup-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drawer-cockpit-link')).not.toBeInTheDocument();
    // In-app nav links are present
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toHaveAttribute('href', '/app');
  });
});

describe('<HeaderNav /> mobile drawer — PR-UX-1 marketing parity with desktop MktNav', () => {
  it('exposes Product / Simulator / Pricing anchored at the canonical landing ids', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated={false} />);
    await openDrawer();

    expect(screen.getByRole('link', { name: 'Produit' })).toHaveAttribute('href', '/#principles');
    expect(screen.getByRole('link', { name: 'Simulateur' })).toHaveAttribute(
      'href',
      '/#simulator',
    );
    expect(screen.getByRole('link', { name: 'Tarifs' })).toHaveAttribute('href', '/#pricing');
  });

  it('keeps FAQ as the only cross-page entry inside the marketing drawer', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated={false} />);
    await openDrawer();
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq');
  });
});

describe('<HeaderNav /> mobile drawer — PR-UX-1 admin entry in app variant', () => {
  it('app variant + isAdmin=true exposes the Admin link mirrors with the desktop marker', async () => {
    render(<HeaderNav variant="app" isAuthenticated isAdmin />);
    await openDrawer();

    // aria-label carries the "founder only" context (parity with desktop).
    const adminLink = screen.getByRole('link', { name: 'Espace admin (réservé fondateur)' });
    expect(adminLink).toHaveAttribute('href', '/admin');
    // Visible label is the short "Admin".
    expect(adminLink).toHaveTextContent('Admin');
  });

  it('app variant + isAdmin omitted hides the Admin link (fail-closed default)', async () => {
    render(<HeaderNav variant="app" isAuthenticated />);
    await openDrawer();
    expect(
      screen.queryByRole('link', { name: 'Espace admin (réservé fondateur)' }),
    ).not.toBeInTheDocument();
  });

  it('marketing variant never exposes the Admin link, even if isAdmin=true', async () => {
    render(<HeaderNav variant="marketing" isAuthenticated isAdmin />);
    await openDrawer();
    expect(
      screen.queryByRole('link', { name: 'Espace admin (réservé fondateur)' }),
    ).not.toBeInTheDocument();
  });
});
