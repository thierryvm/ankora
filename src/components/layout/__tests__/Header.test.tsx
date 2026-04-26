import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';
import { createIntlServerMock, createNavigationMock } from '../../../../tests/helpers/intl-mocks';

vi.mock('next-intl/server', () => createIntlServerMock());
vi.mock('@/i18n/navigation', () => createNavigationMock());
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
    expect(screen.getByRole('link', { name: messages.common.nav.features })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.common.nav.faq })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.common.nav.login })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.common.nav.signup })).toBeInTheDocument();
  });

  it('marketing variant + isAuthenticated shows the cockpit CTA instead of login/signup', async () => {
    await renderHeader({ variant: 'marketing', isAuthenticated: true });
    expect(screen.queryByRole('link', { name: messages.common.nav.login })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: messages.common.nav.signup }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.common.nav.myCockpit })).toBeInTheDocument();
  });

  it('app variant shows the in-app navigation (dashboard, accounts, charges, settings)', async () => {
    await renderHeader({ variant: 'app', isAuthenticated: true });
    expect(screen.getByRole('link', { name: messages.common.nav.dashboard })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.common.nav.accounts })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.common.nav.charges })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.common.nav.settings })).toBeInTheDocument();
  });

  it('home link points to / when unauthenticated, /app when authenticated', async () => {
    const { unmount } = await renderHeader({ variant: 'marketing', isAuthenticated: false });
    expect(screen.getByLabelText(messages.common.homeAria)).toHaveAttribute('href', '/');
    unmount();

    await renderHeader({ variant: 'marketing', isAuthenticated: true });
    expect(screen.getByLabelText(messages.common.homeAria)).toHaveAttribute('href', '/app');
  });
});
