import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../messages/fr-BE.json';

const renameMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const routerRefreshMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/accounts', () => ({
  renameAccountByTypeAction: renameMock,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}));

// next/navigation is unavailable under jsdom; the App Router context is
// not mounted in unit tests, so we stub the hook outright.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { AccountCardEditableTitle } from '@/components/features/AccountCardEditableTitle';

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      {ui}
    </NextIntlClientProvider>,
  );
}

const baseProps = {
  accountType: 'income_bills' as const,
  displayName: 'Compte Principal',
  subLabel: 'Salaires & Factures',
};

describe('<AccountCardEditableTitle />', () => {
  beforeEach(() => {
    renameMock.mockReset();
    toastErrorMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it('renders the display name as a button by default', () => {
    renderWithIntl(<AccountCardEditableTitle {...baseProps} />);
    const button = screen.getByRole('button', { name: /Renommer le compte/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Compte Principal');
  });

  it('shows the sub-label below the title', () => {
    renderWithIntl(<AccountCardEditableTitle {...baseProps} />);
    expect(screen.getByText('Salaires & Factures')).toBeInTheDocument();
  });

  it('switches to an input on click', async () => {
    renderWithIntl(<AccountCardEditableTitle {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Renommer le compte/i }));
    const input = await screen.findByRole('textbox');
    expect(input).toHaveValue('Compte Principal');
    expect(input).toHaveAttribute('maxLength', '50');
  });

  it('reverts on Escape without calling the Server Action', async () => {
    renderWithIntl(<AccountCardEditableTitle {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Renommer le compte/i }));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Belfius' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(renameMock).not.toHaveBeenCalled();
    // Back to button mode
    expect(screen.getByRole('button', { name: /Renommer le compte/i })).toBeInTheDocument();
  });

  it('calls renameAccountByTypeAction on Enter with the trimmed new name', async () => {
    renameMock.mockResolvedValue({ ok: true });
    renderWithIntl(<AccountCardEditableTitle {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Renommer le compte/i }));
    const input = await screen.findByRole('textbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: '  Belfius  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    await waitFor(() => {
      expect(renameMock).toHaveBeenCalledWith({
        accountType: 'income_bills',
        displayName: 'Belfius',
      });
    });
  });

  it('skips the Server Action when the value is unchanged', async () => {
    renderWithIntl(<AccountCardEditableTitle {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Renommer le compte/i }));
    const input = await screen.findByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameMock).not.toHaveBeenCalled();
  });

  it('shows an error toast when client validation rejects HTML chars', async () => {
    renderWithIntl(<AccountCardEditableTitle {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Renommer le compte/i }));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: '<script>' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(renameMock).not.toHaveBeenCalled();
  });

  it('shows an error toast and refreshes the route when the Server Action returns ok: false', async () => {
    renameMock.mockResolvedValue({ ok: false, errorCode: 'errors.accounts.renameFailed' });
    renderWithIntl(<AccountCardEditableTitle {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Renommer le compte/i }));
    const input = await screen.findByRole('textbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Belfius' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
    // router.refresh() forces the Server Component tree to re-render so
    // that useOptimistic snaps back to the canonical displayName.
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('exposes an aria-label that names the current account', () => {
    renderWithIntl(<AccountCardEditableTitle {...baseProps} />);
    const button = screen.getByRole('button', { name: 'Renommer le compte « Compte Principal »' });
    expect(button).toBeInTheDocument();
  });
});
