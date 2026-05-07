import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import frMessages from '../../../../messages/fr-BE.json';

/**
 * AppBreadcrumbs is a Client Component using next-intl's Link / usePathname
 * via createNavigation. We mock both at module level so we can render under
 * jsdom without a real next-intl provider.
 */

let mockPathname = '/';

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => mockPathname,
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    return (key: string) => {
      const ns = (frMessages as Record<string, Record<string, unknown>>)[namespace.split('.')[0]!];
      // Walk dot-separated namespace
      const parts = namespace.split('.').slice(1);
      let value: unknown = ns;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        }
      }
      // Then resolve key
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

import { AppBreadcrumbs } from '../AppBreadcrumbs';

describe('<AppBreadcrumbs />', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders nothing on /app (dashboard root has no breadcrumb)', () => {
    mockPathname = '/app';
    const { container } = render(<AppBreadcrumbs />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing on an unmapped path', () => {
    mockPathname = '/app/unknown-route';
    const { container } = render(<AppBreadcrumbs />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Dashboard / Mes comptes for /app/accounts (FR)', () => {
    mockPathname = '/app/accounts';
    render(<AppBreadcrumbs />);
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toHaveAttribute('href', '/app');
    expect(screen.getByText('Mes comptes')).toBeInTheDocument();
    expect(screen.getByText('Mes comptes').closest('a')).toBeNull();
  });

  it('renders /app/charges with current page label not clickable', () => {
    mockPathname = '/app/charges';
    render(<AppBreadcrumbs />);
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeInTheDocument();
    const current = screen.getByText('Mes charges');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.closest('a')).toBeNull();
  });

  it('renders /app/expenses correctly', () => {
    mockPathname = '/app/expenses';
    render(<AppBreadcrumbs />);
    expect(screen.getByText('Mes dépenses')).toHaveAttribute('aria-current', 'page');
  });

  it('renders /app/simulator correctly', () => {
    mockPathname = '/app/simulator';
    render(<AppBreadcrumbs />);
    expect(screen.getByText('Simulateur')).toHaveAttribute('aria-current', 'page');
  });

  it('renders /app/settings correctly', () => {
    mockPathname = '/app/settings';
    render(<AppBreadcrumbs />);
    expect(screen.getByText('Paramètres')).toHaveAttribute('aria-current', 'page');
  });

  it('renders 3-segment chain for /app/settings/deletion-status', () => {
    mockPathname = '/app/settings/deletion-status';
    render(<AppBreadcrumbs />);
    // jsdom doesn't apply Tailwind responsive classes, so both the mobile compact
    // chain and the desktop chain are rendered in the DOM. We assert that the
    // semantic skeleton is correct in at least one of them.
    const dashboardLinks = screen.getAllByRole('link', { name: 'Tableau de bord' });
    expect(dashboardLinks.length).toBeGreaterThan(0);
    expect(dashboardLinks[0]).toHaveAttribute('href', '/app');

    // Settings is the intermediate segment — desktop renders it as a link.
    const settingsLinks = screen.getAllByRole('link', { name: 'Paramètres' });
    expect(settingsLinks.length).toBeGreaterThan(0);
    expect(settingsLinks[0]).toHaveAttribute('href', '/app/settings');

    // Last segment present and marked aria-current="page"
    const current = screen
      .getAllByText('Suppression du compte')
      .find((el) => el.getAttribute('aria-current') === 'page');
    expect(current).toBeDefined();
  });

  it('strips trailing slash from pathname', () => {
    mockPathname = '/app/charges/';
    render(<AppBreadcrumbs />);
    expect(screen.getByText('Mes charges')).toHaveAttribute('aria-current', 'page');
  });

  it('exposes a navigation landmark with breadcrumb aria-label', () => {
    mockPathname = '/app/charges';
    render(<AppBreadcrumbs />);
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toBeInTheDocument();
  });
});
