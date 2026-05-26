import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../messages/fr-BE.json';

const updateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const routerRefreshMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/reste-a-vivre', () => ({
  updateResteAVivreOverrideAction: updateMock,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { AjusterResteAVivreDrawer } from '../AjusterResteAVivreDrawer';

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      {ui}
    </NextIntlClientProvider>,
  );
}

const baseProps = {
  currentMonthYYYYMM: '2026-05',
  initialResteAVivre: 500,
  monthlyIncome: 2500,
};

describe('<AjusterResteAVivreDrawer /> — closed state', () => {
  beforeEach(() => {
    updateMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it('renders the trigger button labelled "Ajuster ce mois"', () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    const trigger = screen.getByTestId('reste-a-vivre-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent ?? '').toContain(messages.dashboard.capacite.subStats.ajusterCeMois);
  });

  it('does not show the dialog until the trigger is clicked', () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    expect(screen.queryByTestId('reste-a-vivre-drawer')).toBeNull();
  });
});

describe('<AjusterResteAVivreDrawer /> — open state', () => {
  beforeEach(() => {
    updateMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it('opens the dialog with the input pre-filled with initialResteAVivre', async () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    const input = await screen.findByTestId('reste-a-vivre-input');
    expect(input).toHaveValue('500.00');
  });

  it('renders the drawer title from i18n', async () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    expect(await screen.findByText(messages.dashboard.capacite.drawer.title)).toBeInTheDocument();
  });

  it('shows the helperCoherent text when ratio is ≈ 20% of income', async () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    const helper = await screen.findByTestId('reste-a-vivre-helper');
    // 500 / 2500 = 20% → coherent
    expect(helper.textContent ?? '').toBe(messages.dashboard.capacite.drawer.helperCoherent);
  });

  it('switches to helperBas when ratio < 15%', async () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} initialResteAVivre={200} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    const helper = await screen.findByTestId('reste-a-vivre-helper');
    // 200 / 2500 = 8% → low
    expect(helper.textContent ?? '').toBe(messages.dashboard.capacite.drawer.helperBas);
  });

  it('switches to helperHaut when ratio > 50%', async () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} initialResteAVivre={1500} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    const helper = await screen.findByTestId('reste-a-vivre-helper');
    // 1500 / 2500 = 60% → high
    expect(helper.textContent ?? '').toBe(messages.dashboard.capacite.drawer.helperHaut);
  });

  it('helper falls back to coherent when monthlyIncome is null', async () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} monthlyIncome={null} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    const helper = await screen.findByTestId('reste-a-vivre-helper');
    expect(helper.textContent ?? '').toBe(messages.dashboard.capacite.drawer.helperCoherent);
  });

  it('updates the helper live when the user edits the input', async () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    const input = await screen.findByTestId('reste-a-vivre-input');
    fireEvent.change(input, { target: { value: '1400' } });
    const helper = screen.getByTestId('reste-a-vivre-helper');
    // 1400 / 2500 = 56% → high
    expect(helper.textContent ?? '').toBe(messages.dashboard.capacite.drawer.helperHaut);
  });
});

describe('<AjusterResteAVivreDrawer /> — submit flow', () => {
  beforeEach(() => {
    updateMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it('calls the Server Action with the parsed amount and current monthYYYYMM', async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    const input = await screen.findByTestId('reste-a-vivre-input');
    fireEvent.change(input, { target: { value: '450' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reste-a-vivre-save'));
    });
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        monthYYYYMM: '2026-05',
        montant: 450,
      });
    });
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('closes the drawer on success', async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    await screen.findByTestId('reste-a-vivre-drawer');
    await act(async () => {
      fireEvent.click(screen.getByTestId('reste-a-vivre-save'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('reste-a-vivre-drawer')).toBeNull();
    });
  });

  it('shows a toast error and stays open on failure', async () => {
    updateMock.mockResolvedValue({
      ok: false,
      errorCode: 'errors.settings.resteAVivreUpdateFailed',
    });
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    await screen.findByTestId('reste-a-vivre-drawer');
    await act(async () => {
      fireEvent.click(screen.getByTestId('reste-a-vivre-save'));
    });
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('reste-a-vivre-drawer')).toBeInTheDocument();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it('disables the Save button when the input is invalid (empty/negative)', async () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    const input = await screen.findByTestId('reste-a-vivre-input');
    fireEvent.change(input, { target: { value: '' } });
    const save = screen.getByTestId('reste-a-vivre-save');
    expect(save).toBeDisabled();
  });

  it('accepts decimal comma input (French locale convention)', async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    const input = await screen.findByTestId('reste-a-vivre-input');
    fireEvent.change(input, { target: { value: '425,50' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reste-a-vivre-save'));
    });
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        monthYYYYMM: '2026-05',
        montant: 425.5,
      });
    });
  });
});

describe('<AjusterResteAVivreDrawer /> — keyboard + dismiss', () => {
  beforeEach(() => {
    updateMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it('closes the drawer on Escape without calling the Server Action', async () => {
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    await screen.findByTestId('reste-a-vivre-drawer');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('reste-a-vivre-drawer')).toBeNull();
    });
    expect(updateMock).not.toHaveBeenCalled();
  });
});

// PR-BETA-3 hotfix 2026-05-26 — defensive UX. Before this change a Server
// Action failure (HTTP 503, thrown exception, …) closed the drawer
// silently and the user thought the save succeeded. The drawer now always
// surfaces failures via a toast and stays open so retry is possible.
describe('<AjusterResteAVivreDrawer /> — defensive error toast (hotfix)', () => {
  beforeEach(() => {
    updateMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it('shows a success toast and closes the drawer on { ok: true }', async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    await screen.findByTestId('reste-a-vivre-drawer');
    await act(async () => {
      fireEvent.click(screen.getByTestId('reste-a-vivre-save'));
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    });
    // Localised success copy comes through.
    expect(toastSuccessMock.mock.calls[0]?.[0]).toBe(messages.dashboard.capacite.drawer.success);
    // Drawer closes on success.
    await waitFor(() => {
      expect(screen.queryByTestId('reste-a-vivre-drawer')).toBeNull();
    });
  });

  it('shows a toast error, keeps the drawer open and preserves input when the Server Action throws (network down)', async () => {
    updateMock.mockRejectedValue(new Error('Failed to fetch'));
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    const input = await screen.findByTestId('reste-a-vivre-input');
    fireEvent.change(input, { target: { value: '123' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reste-a-vivre-save'));
    });
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledTimes(1);
    });
    // The drawer must stay open so the user can retry without losing
    // their input.
    expect(screen.getByTestId('reste-a-vivre-drawer')).toBeInTheDocument();
    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    // Sourcery review: assert the typed amount is preserved across the
    // failed submission so the retry doesn't force the user to re-key it.
    expect(input).toHaveValue('123');
  });

  it('translates the errorCode when the Server Action returns { ok: false, errorCode }', async () => {
    updateMock.mockResolvedValue({
      ok: false,
      errorCode: 'errors.settings.resteAVivreUpdateFailed',
    });
    renderWithIntl(<AjusterResteAVivreDrawer {...baseProps} />);
    fireEvent.click(screen.getByTestId('reste-a-vivre-trigger'));
    await screen.findByTestId('reste-a-vivre-drawer');
    await act(async () => {
      fireEvent.click(screen.getByTestId('reste-a-vivre-save'));
    });
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledTimes(1);
    });
    // The toast message MUST be the translated copy, not the raw error code.
    const toastMsg = toastErrorMock.mock.calls[0]?.[0] as string | undefined;
    expect(toastMsg).toBeTypeOf('string');
    expect(toastMsg ?? '').not.toContain('errors.');
    expect((toastMsg ?? '').length).toBeGreaterThan(5);
    // Sourcery review: symmetry with the throw path — the drawer must stay
    // open and the route must NOT refresh so the user can retry without
    // re-entering their amount.
    expect(screen.getByTestId('reste-a-vivre-drawer')).toBeInTheDocument();
    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
