import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import frMessages from '../../../../messages/fr-BE.json';

/**
 * PR-A — AccountButton unit cover.
 *
 * Client component: next-intl, the locale-aware Link, and the logout Server
 * Action are mocked so the dropdown mounts under jsdom without a provider
 * tree. The panel is an `absolute` element (not a portal), so RTL queries
 * find it in the rendered container once opened.
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
  useTranslations: (namespace: string) => (key: string) => {
    const parts = `${namespace}.${key}`.split('.');
    let value: unknown = frMessages;
    for (const part of parts) {
      if (typeof value === 'object' && value !== null && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return key;
      }
    }
    return typeof value === 'string' ? value : key;
  },
}));

vi.mock('@/lib/actions/auth', () => ({
  logoutAction: vi.fn(),
}));

import { AccountButton } from '../AccountButton';

beforeEach(() => {
  cleanup();
});

describe('AccountButton', () => {
  it('derives uppercase initials from the email local-part', () => {
    render(<AccountButton email="thierry@example.com" />);
    // "thierry" → "th" → "TH"
    expect(screen.getByTestId('account-button')).toHaveTextContent('TH');
  });

  it('exposes the closed-popup contract on the trigger', () => {
    render(<AccountButton email="a@b.com" />);
    const trigger = screen.getByTestId('account-button');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-label', frMessages.common.account.menuAria);
    // Closed by default.
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument();
  });

  it('opens the menu on click and surfaces identity + settings + logout', async () => {
    const user = userEvent.setup();
    render(<AccountButton email="thierry@example.com" />);
    await user.click(screen.getByTestId('account-button'));

    expect(screen.getByTestId('account-button')).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByTestId('account-menu');
    expect(menu).toHaveAttribute('role', 'menu');

    // Identity (full email is shown, truncated visually via CSS only).
    expect(menu).toHaveTextContent('thierry@example.com');
    // Settings link points at the cockpit settings route.
    expect(screen.getByTestId('account-menu-settings')).toHaveAttribute('href', '/app/settings');
    // Logout is a submit button wired to the Server Action form.
    const logout = screen.getByTestId('account-menu-logout');
    expect(logout).toHaveAttribute('type', 'submit');
    expect(logout.closest('form')).not.toBeNull();
  });

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup();
    render(<AccountButton email="a@b.com" />);
    await user.click(screen.getByTestId('account-button'));
    expect(screen.getByTestId('account-menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-button')).toHaveAttribute('aria-expanded', 'false');
  });
});
