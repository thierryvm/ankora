import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const replaceMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/admin',
}));

import { LangSwitcherClient } from '../LangSwitcherClient';

beforeEach(() => {
  replaceMock.mockReset();
});

/**
 * Wiring contract for the AdminTopbar LangSwitcher consumer (PR-D4-PHASE2-B).
 *
 * Pinning the contract here means a future refactor (e.g. switching to
 * `router.push` instead of `replace`, or dropping the locale param) breaks
 * this test before it ships to prod. Atom-level tests live in
 * `src/components/atoms/__tests__/LangSwitcher.test.tsx`.
 */
describe('<LangSwitcherClient /> consumer wiring', () => {
  it('renders LangSwitcher with current locale prop', () => {
    render(<LangSwitcherClient currentLocale="fr-BE" />);
    // Trigger button shows the FR flag + code (visible label = code).
    expect(screen.getByRole('button', { name: 'Changer de langue' })).toBeInTheDocument();
    expect(screen.getByText('FR')).toBeInTheDocument();
  });

  it('clicking an option calls router.replace with current pathname + new locale', async () => {
    const user = userEvent.setup();
    render(<LangSwitcherClient currentLocale="fr-BE" />);

    // Open the dropdown
    await user.click(screen.getByRole('button', { name: 'Changer de langue' }));

    // Click the EN option
    const enOption = screen.getByRole('option', { name: /English/ });
    await user.click(enOption);

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/admin', { locale: 'en' });
  });

  it('clicking the currently-active locale still calls router.replace (no-op user-side)', async () => {
    // Atom delegates the no-op decision to the consumer. The Client wrapper
    // forwards the click — next-intl router handles idempotency internally.
    const user = userEvent.setup();
    render(<LangSwitcherClient currentLocale="fr-BE" />);
    await user.click(screen.getByRole('button', { name: 'Changer de langue' }));
    const frOption = screen.getByRole('option', { name: /Français/ });
    await user.click(frOption);
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/admin', { locale: 'fr-BE' });
  });
});
