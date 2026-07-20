/**
 * CommitmentsClient — épic « Dettes & échéanciers » PR-2.
 *
 * The page's promise: for every commitment you see WHAT IS LEFT to pay and how
 * far along you are, and ticking an instalment moves both instantly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const createMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const toggleMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/commitments', () => ({
  createCommitmentAction: createMock,
  deleteCommitmentAction: deleteMock,
  toggleCommitmentPaymentAction: toggleMock,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { CommitmentsClient, type RawCommitment } from '../CommitmentsClient';

type Props = React.ComponentProps<typeof CommitmentsClient>;

/** Car loan: 4 200 € left over 17 monthly instalments of 250 €, from Jan 2026. */
const carLoan: RawCommitment = {
  id: 'car',
  label: 'Crédit voiture',
  kind: 'debt',
  totalAmount: 4200,
  installmentAmount: 250,
  installmentsTotal: 17,
  startYear: 2026,
  startMonth: 1,
  paymentDay: 15,
  frequency: 'monthly',
  notes: null,
  isActive: true,
};

function renderPage(
  commitments: RawCommitment[],
  overrides: Partial<Omit<Props, 'commitments'>> = {},
) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <CommitmentsClient
        commitments={commitments}
        paidKeysByCommitment={overrides.paidKeysByCommitment ?? {}}
        currentPeriod={overrides.currentPeriod ?? { year: 2026, month: 1 }}
        locale="fr-BE"
      />
    </NextIntlClientProvider>,
  );
}

describe('<CommitmentsClient />', () => {
  beforeEach(() => {
    createMock.mockReset();
    deleteMock.mockReset();
    toggleMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it('shows the empty state when there is no commitment', () => {
    renderPage([]);
    expect(screen.getByTestId('commitments-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('commitments-total-remaining')).toBeNull();
  });

  it('shows the full remaining balance and a 0% progress bar when nothing is paid', () => {
    renderPage([carLoan]);
    expect(screen.getByTestId('commitment-remaining-car')).toHaveTextContent(/4[  ]200/);
    expect(screen.getByTestId('commitment-progress-car')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByTestId('commitments-total-remaining')).toHaveTextContent(/4[  ]200/);
  });

  it('decreases the balance and advances the bar for each paid instalment', () => {
    // Two instalments ticked (Jan + Feb 2026) → 4 200 − 2×250 = 3 700 €, 2/17.
    renderPage([carLoan], { paidKeysByCommitment: { car: ['2026-1', '2026-2'] } });
    expect(screen.getByTestId('commitment-remaining-car')).toHaveTextContent(/3[  ]700/);
    expect(screen.getByTestId('commitment-progress-car')).toHaveAttribute('aria-valuenow', '12');
    const row = screen.getByTestId('commitment-row-car');
    expect(within(row).getByText(/2\/17 échéances/)).toBeInTheDocument();
  });

  it('lands on 0 € with a full bar once every instalment is ticked', () => {
    const all = Array.from({ length: 17 }, (_, i) => {
      const total = 0 + i; // from Jan 2026
      return `${2026 + Math.floor(total / 12)}-${(total % 12) + 1}`;
    });
    renderPage([carLoan], { paidKeysByCommitment: { car: all } });
    expect(screen.getByTestId('commitment-remaining-car')).toHaveTextContent(/^0/);
    expect(screen.getByTestId('commitment-progress-car')).toHaveAttribute('aria-valuenow', '100');
  });

  it('renders a one-off as a single dated amount, with no instalment wording', () => {
    const oneOff: RawCommitment = {
      ...carLoan,
      id: 'boiler',
      label: 'Entretien chaudière',
      kind: 'one_off',
      totalAmount: 340,
      installmentAmount: null,
      installmentsTotal: 1,
      startMonth: 10,
    };
    renderPage([oneOff], { currentPeriod: { year: 2026, month: 10 } });
    const row = screen.getByTestId('commitment-row-boiler');
    expect(within(row).getByText(/octobre 2026/i)).toBeInTheDocument();
    expect(within(row).queryByText(/échéances/)).toBeNull();
  });

  it('exposes the tick only when an instalment is due in the viewed period', () => {
    // March 2026 IS on the monthly schedule; the loan started in January.
    renderPage([carLoan], { currentPeriod: { year: 2026, month: 3 } });
    expect(screen.getByTestId('commitment-paid-car')).toBeInTheDocument();
    // A one-off due in October has nothing to tick in January.
    const oneOff: RawCommitment = {
      ...carLoan,
      id: 'later',
      kind: 'one_off',
      installmentsTotal: 1,
      installmentAmount: null,
      startMonth: 10,
    };
    renderPage([oneOff], { currentPeriod: { year: 2026, month: 1 } });
    expect(screen.queryByTestId('commitment-paid-later')).toBeNull();
  });

  it('ticks an instalment optimistically and calls the action with the viewed period', async () => {
    let resolveAction!: (v: { ok: true; data: { paid: boolean } }) => void;
    toggleMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveAction = res;
        }),
    );
    renderPage([carLoan], { currentPeriod: { year: 2026, month: 3 } });
    const tick = screen.getByTestId('commitment-paid-car');
    expect(tick).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(tick);
    // Optimistic state is visible while the server call is pending.
    await waitFor(() => expect(tick).toHaveAttribute('aria-pressed', 'true'));
    expect(toggleMock).toHaveBeenCalledWith({
      commitmentId: 'car',
      periodYear: 2026,
      periodMonth: 3,
    });
    await act(async () => {
      resolveAction({ ok: true, data: { paid: true } });
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it('shows an error toast when the tick fails', async () => {
    toggleMock.mockResolvedValue({
      ok: false,
      errorCode: 'errors.commitments.payments.toggleFailed',
    });
    renderPage([carLoan], { currentPeriod: { year: 2026, month: 3 } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('commitment-paid-car'));
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it('creates a commitment with the anchor set to the viewed period', async () => {
    createMock.mockResolvedValue({ ok: true });
    renderPage([], { currentPeriod: { year: 2026, month: 5 } });
    fireEvent.click(screen.getByTestId('commitments-add-toggle'));
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Arrangement SPF' } });
    fireEvent.change(screen.getByLabelText(/Montant restant dû/), { target: { value: '1600' } });
    fireEvent.change(screen.getByLabelText(/Montant par échéance/), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText(/Nombre d'échéances/), { target: { value: '8' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /^ajouter$/i }).closest('form')!);
    });
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({
      label: 'Arrangement SPF',
      totalAmount: 1600,
      installmentAmount: 200,
      installmentsTotal: 8,
      startYear: 2026,
      startMonth: 5,
    });
  });

  it('hides the instalment fields for a one-off and sends a single instalment', async () => {
    createMock.mockResolvedValue({ ok: true });
    renderPage([], { currentPeriod: { year: 2026, month: 5 } });
    fireEvent.click(screen.getByTestId('commitments-add-toggle'));
    fireEvent.change(screen.getByTestId('commitment-kind'), { target: { value: 'one_off' } });
    expect(screen.queryByLabelText(/Montant par échéance/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Entretien' } });
    fireEvent.change(screen.getByLabelText(/Montant restant dû/), { target: { value: '340' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /^ajouter$/i }).closest('form')!);
    });
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const payload = createMock.mock.calls[0]?.[0];
    expect(payload.installmentsTotal).toBe(1);
    expect(payload.installmentAmount).toBeUndefined();
  });

  it('deletes a commitment', async () => {
    deleteMock.mockResolvedValue({ ok: true });
    renderPage([carLoan]);
    await act(async () => {
      fireEvent.click(screen.getByTestId('commitment-delete-car'));
    });
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('car'));
  });
});
