/**
 * CommitmentsClient — the SHAPE of the v3 mockup (E1 bis): E5 head card with
 * « se termine en », E6 row whose edit/delete live in a Sheet drawer, delete
 * confirmed. The counter stays on the row (it is the row's one action).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const deleteMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/commitments', () => ({
  createCommitmentAction: vi.fn(),
  updateCommitmentAction: vi.fn(),
  deleteCommitmentAction: deleteMock,
  toggleCommitmentPaymentAction: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CommitmentsClient, type RawCommitment, type ThisMonth } from '../CommitmentsClient';

const loan: RawCommitment = {
  id: 'car',
  label: 'Crédit voiture',
  kind: 'debt',
  totalAmount: 2820,
  installmentAmount: 235,
  installmentsTotal: 12,
  startYear: 2026,
  startMonth: 1,
  paymentDay: 15,
  frequency: 'monthly',
  notes: null,
  isActive: true,
  paidFrom: 'principal',
};

function renderPage(
  commitments: RawCommitment[],
  thisMonth: ThisMonth = {
    total: 235,
    parts: [{ id: 'car', label: 'Crédit voiture', amount: 235, isPaid: false }],
  },
) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <CommitmentsClient
        commitments={commitments}
        paidKeysByCommitment={{}}
        currentPeriod={{ year: 2026, month: 1 }}
        thisMonth={thisMonth}
        locale="fr-BE"
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => deleteMock.mockReset());

describe('CommitmentsClient — v3 shape', () => {
  it('E5: the head card gives the total still owed and when it ends', () => {
    renderPage([loan]);
    const card = screen.getByTestId('commitments-head-card');
    expect(card).toHaveTextContent('Total restant dû');
    expect(within(card).getByTestId('commitments-total-remaining')).toHaveTextContent(
      /2[\u00a0\u202f ]820/,
    );
    expect(card).toHaveTextContent(/1 engagement, 1 en cours · se termine en décembre 2026/);
  });

  // E5 of the mockup (engagements.js:57): the card also says what falls THIS
  // month — the count and the sum of the instalments due, derived server-side.
  it('E5: the head card says « ce mois : k échéances, X »', () => {
    renderPage([loan], {
      total: 470,
      parts: [
        { id: 'car', label: 'Crédit voiture', amount: 235, isPaid: false },
        { id: 'tv', label: 'Télévision', amount: 235, isPaid: true },
      ],
    });
    expect(screen.getByTestId('commitments-head-this-month')).toHaveTextContent(
      /ce mois : 2 échéances, 470\s€/,
    );
  });

  // Rule 10: « X » opens on the instalments that make it, each with its amount
  // and whether it is already paid. The lines come from the server with the
  // total; nothing is re-added on screen.
  it('E5: « ce mois » opens on each instalment that makes the amount', () => {
    renderPage([loan], {
      total: 470,
      parts: [
        { id: 'car', label: 'Crédit voiture', amount: 235, isPaid: false },
        { id: 'tv', label: 'Télévision', amount: 235, isPaid: true },
      ],
    });
    const lines = screen.getAllByTestId(/^commitments-this-month-part-/);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent(/Crédit voiture.*235\s€/);
    expect(lines[0]).not.toHaveTextContent(/payée/);
    expect(lines[1]).toHaveTextContent(/Télévision · payée.*235\s€/);
    fireEvent.click(screen.getByTestId('commitments-head-this-month'));
    expect(lines[0]).toBeVisible();
  });

  it('E5: with nothing due this month, it says so with zero and opens on nothing', () => {
    renderPage([loan], { total: 0, parts: [] });
    expect(screen.getByTestId('commitments-head-this-month')).toHaveTextContent(
      /ce mois : 0 échéance, 0\s€/,
    );
    expect(screen.queryAllByTestId(/^commitments-this-month-part-/)).toHaveLength(0);
  });

  it('E6: the row keeps its counter but no edit or delete button', () => {
    renderPage([loan]);
    const row = screen.getByTestId('commitment-row-car');
    expect(within(row).queryByTestId('commitment-edit-car')).toBeNull();
    expect(within(row).queryByTestId('commitment-delete-car')).toBeNull();
    expect(within(row).getByTestId('commitment-open-car')).toHaveTextContent(/^Crédit voiture/);
  });

  it('E6: the drawer is a Sheet carrying Modifier and Supprimer; delete is confirmed', async () => {
    deleteMock.mockResolvedValue({ ok: true });
    renderPage([loan]);
    fireEvent.click(screen.getByTestId('commitment-open-car'));
    const drawer = await screen.findByTestId('commitment-drawer');
    expect(drawer).toHaveAttribute('role', 'dialog');
    expect(within(drawer).getByTestId('commitment-edit-car')).toBeVisible();
    fireEvent.click(within(drawer).getByTestId('commitment-delete-car'));
    expect(deleteMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByTestId('commitment-delete-confirm'));
    });
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('car'));
  });

  it('E6: « Modifier » in the drawer closes it and opens the form on that commitment', async () => {
    renderPage([loan]);
    fireEvent.click(screen.getByTestId('commitment-open-car'));
    fireEvent.click(await screen.findByTestId('commitment-edit-car'));
    await waitFor(() => expect(screen.queryByTestId('commitment-drawer')).toBeNull());
    expect(screen.getByLabelText('Description')).toHaveValue('Crédit voiture');
  });
});
