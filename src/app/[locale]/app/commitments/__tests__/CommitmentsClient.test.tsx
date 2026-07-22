/**
 * CommitmentsClient — épic « Dettes & échéanciers ».
 *
 * The page's promise: for every commitment you see WHAT IS LEFT to pay and how
 * far along you are; the − / + stepper validates each of the N instalments, and
 * the pencil edits the commitment. Both move the balance + bar instantly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const createMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const toggleMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/commitments', () => ({
  createCommitmentAction: createMock,
  updateCommitmentAction: updateMock,
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
    updateMock.mockReset();
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
    renderPage([carLoan], { paidKeysByCommitment: { car: ['2026-1', '2026-2'] } });
    expect(screen.getByTestId('commitment-remaining-car')).toHaveTextContent(/3[  ]700/);
    expect(screen.getByTestId('commitment-progress-car')).toHaveAttribute('aria-valuenow', '12');
    const row = screen.getByTestId('commitment-row-car');
    expect(within(row).getByText(/2\/17 échéances/)).toBeInTheDocument();
  });

  it('lands on 0 € with a full bar once every instalment is ticked', () => {
    const all = Array.from(
      { length: 17 },
      (_, i) => `${2026 + Math.floor(i / 12)}-${(i % 12) + 1}`,
    );
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
    expect(within(row).queryByText(/\d\/\d+ échéances/)).toBeNull();
  });

  // --- Multi-instalment validation via the − / + stepper -------------------

  it('shows the payment stepper with the paid / total count on every commitment', () => {
    renderPage([carLoan], { paidKeysByCommitment: { car: ['2026-1'] } });
    const row = screen.getByTestId('commitment-row-car');
    expect(within(row).getByTestId('stepper-count')).toHaveTextContent('1 / 17');
    expect(within(row).getByTestId('stepper-dec')).not.toBeDisabled();
    expect(within(row).getByTestId('stepper-inc')).not.toBeDisabled();
  });

  it('disables − at 0 paid', () => {
    renderPage([carLoan]);
    expect(screen.getByTestId('stepper-dec')).toBeDisabled();
    expect(screen.getByTestId('stepper-inc')).not.toBeDisabled();
  });

  it('+ marks the earliest unpaid instalment and calls the toggle with that period', async () => {
    let resolveAction!: (v: { ok: true; data: { paid: boolean } }) => void;
    toggleMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveAction = res;
        }),
    );
    renderPage([carLoan], { currentPeriod: { year: 2026, month: 3 } });
    expect(screen.getByTestId('stepper-count')).toHaveTextContent('0 / 17');

    fireEvent.click(screen.getByTestId('stepper-inc'));
    // Optimistic: the count advances while the server call is pending.
    await waitFor(() => expect(screen.getByTestId('stepper-count')).toHaveTextContent('1 / 17'));
    // Earliest unpaid scheduled period is Jan 2026 — NOT the viewed month.
    expect(toggleMock).toHaveBeenCalledWith({
      commitmentId: 'car',
      periodYear: 2026,
      periodMonth: 1,
    });
    await act(async () => {
      resolveAction({ ok: true, data: { paid: true } });
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it('+ fills the oldest hole (Jan paid → ticks Feb) and moves balance + bar', async () => {
    let resolveAction!: (v: { ok: true; data: { paid: boolean } }) => void;
    toggleMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveAction = res;
        }),
    );
    renderPage([carLoan], { paidKeysByCommitment: { car: ['2026-1'] } });
    expect(screen.getByTestId('commitment-remaining-car')).toHaveTextContent(/3[  ]950/);

    fireEvent.click(screen.getByTestId('stepper-inc'));
    await waitFor(() =>
      expect(screen.getByTestId('commitment-remaining-car')).toHaveTextContent(/3[  ]700/),
    );
    expect(screen.getByTestId('commitment-progress-car')).toHaveAttribute('aria-valuenow', '12');
    expect(toggleMock).toHaveBeenCalledWith({
      commitmentId: 'car',
      periodYear: 2026,
      periodMonth: 2,
    });
    await act(async () => {
      resolveAction({ ok: true, data: { paid: true } });
    });
  });

  it('− un-marks the latest paid instalment', async () => {
    let resolveAction!: (v: { ok: true; data: { paid: boolean } }) => void;
    toggleMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveAction = res;
        }),
    );
    renderPage([carLoan], { paidKeysByCommitment: { car: ['2026-1', '2026-2'] } });
    expect(screen.getByTestId('stepper-count')).toHaveTextContent('2 / 17');

    fireEvent.click(screen.getByTestId('stepper-dec'));
    await waitFor(() => expect(screen.getByTestId('stepper-count')).toHaveTextContent('1 / 17'));
    // Latest paid scheduled period is Feb 2026.
    expect(toggleMock).toHaveBeenCalledWith({
      commitmentId: 'car',
      periodYear: 2026,
      periodMonth: 2,
    });
    await act(async () => {
      resolveAction({ ok: true, data: { paid: false } });
    });
  });

  it('shows an error toast when a + tick fails', async () => {
    toggleMock.mockResolvedValue({
      ok: false,
      errorCode: 'errors.commitments.payments.toggleFailed',
    });
    renderPage([carLoan]);
    await act(async () => {
      fireEvent.click(screen.getByTestId('stepper-inc'));
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it('rolls the optimistic + tick BACK when the action is rejected (no manual revert)', async () => {
    // useOptimistic discards its value on settle and re-derives from the base,
    // which a rejected toggle left untouched. Re-locks the Sourcery #234 contract
    // on the explicit-intent reducer.
    toggleMock.mockResolvedValue({
      ok: false,
      errorCode: 'errors.commitments.payments.toggleFailed',
    });
    renderPage([carLoan]);
    await act(async () => {
      fireEvent.click(screen.getByTestId('stepper-inc'));
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(screen.getByTestId('stepper-count')).toHaveTextContent('0 / 17');
    expect(screen.getByTestId('commitment-remaining-car')).toHaveTextContent(/4[  ]200/);
  });

  it('rolls back the same way when the action throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    toggleMock.mockRejectedValueOnce(new Error('network error'));
    renderPage([carLoan]);
    await act(async () => {
      fireEvent.click(screen.getByTestId('stepper-inc'));
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(screen.getByTestId('stepper-count')).toHaveTextContent('0 / 17');
    consoleSpy.mockRestore();
  });

  // --- Create --------------------------------------------------------------

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

  it('surfaces a creation failure and keeps the form open', async () => {
    createMock.mockResolvedValue({ ok: false, errorCode: 'errors.commitments.createFailed' });
    renderPage([]);
    fireEvent.click(screen.getByTestId('commitments-add-toggle'));
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText(/Montant restant dû/), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/Montant par échéance/), { target: { value: '10' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /^ajouter$/i }).closest('form')!);
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(screen.getByLabelText('Libellé')).toBeInTheDocument();
  });

  it('rejects a negative amount client-side, before calling the action', async () => {
    renderPage([]);
    fireEvent.click(screen.getByTestId('commitments-add-toggle'));
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText(/Montant restant dû/), { target: { value: '-5' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /^ajouter$/i }).closest('form')!);
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalled();
  });

  // --- Edit ----------------------------------------------------------------

  it('edits a commitment: the pencil prefills the form and calls updateCommitmentAction', async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderPage([carLoan]);
    fireEvent.click(screen.getByTestId('commitment-edit-car'));
    // Form is prefilled with the row's current values.
    expect(screen.getByLabelText('Libellé')).toHaveValue('Crédit voiture');
    expect(screen.getByLabelText(/Nombre d'échéances/)).toHaveValue(17);

    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Crédit auto' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /enregistrer/i }).closest('form')!);
    });
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0]?.[0]).toBe('car');
    expect(updateMock.mock.calls[0]?.[1]).toMatchObject({
      label: 'Crédit auto',
      installmentsTotal: 17,
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('blocks reducing installmentsTotal below the number already ticked', async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderPage([carLoan], { paidKeysByCommitment: { car: ['2026-1', '2026-2', '2026-3'] } });
    fireEvent.click(screen.getByTestId('commitment-edit-car'));
    fireEvent.change(screen.getByLabelText(/Nombre d'échéances/), { target: { value: '2' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /enregistrer/i }).closest('form')!);
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalled();
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
