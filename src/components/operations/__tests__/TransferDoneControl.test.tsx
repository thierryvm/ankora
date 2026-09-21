import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../messages/fr-BE.json';

const actions = vi.hoisted(() => ({
  record: vi.fn(async (_input: unknown) => ({ ok: true, data: { id: 'mv-1' } })),
  cancel: vi.fn(async (_input: unknown) => ({ ok: true })),
}));
vi.mock('@/lib/actions/operations', () => ({
  recordPlannedTransferAction: actions.record,
  setMovementCancelledAction: actions.cancel,
}));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { TransferDoneControl, type TransferLineState } from '../TransferDoneControl';

/*
 * The cockpit's « J'ai fait ce virement ». Figures are fictitious: a plan line
 * of 280/12 + 70/3 (= 46.666…) to the provisions account, of which 23.33 is
 * provisions for the bills.
 */
const BASE = {
  lineLabel: 'Vers Provisions pour tes factures',
  fromAccountType: 'income_bills' as const,
  toAccountType: 'provisions' as const,
  suggested: 280 / 12 + 70 / 3,
  plannedProvisions: 23.33,
  planYear: 2026,
  planMonth: 9,
  today: '2026-09-21',
};

function renderControl(line: TransferLineState, overrides: Partial<typeof BASE> = {}) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <TransferDoneControl {...BASE} {...overrides} line={line} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  actions.record.mockClear();
  actions.cancel.mockClear();
});

describe('TransferDoneControl — « J’ai fait ce virement »', () => {
  it('prefills the suggested amount rounded to the cent, never with more decimals', async () => {
    renderControl({ state: 'todo', cancelledId: null });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'J’ai fait ce virement : Vers Provisions pour tes factures',
      }),
    );
    const sheet = screen.getByTestId('feuille-virement');
    const amount = within(sheet).getByLabelText('Combien as-tu viré ?') as HTMLInputElement;
    expect(amount.value).toBe('46.67');
  });

  it('shows the provisions / free savings split of the amount typed, then writes it', async () => {
    renderControl({ state: 'todo', cancelledId: null });
    await userEvent.click(screen.getByRole('button', { name: /J’ai fait ce virement/ }));
    const sheet = screen.getByTestId('feuille-virement');
    const amount = within(sheet).getByLabelText('Combien as-tu viré ?');
    await userEvent.clear(amount);
    await userEvent.type(amount, '50');
    expect(sheet.textContent).toMatch(/23,33\s€ de provisions \+ 26,67\s€ d’épargne libre/);

    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));
    expect(actions.record).toHaveBeenCalledWith({
      fromAccountType: 'income_bills',
      toAccountType: 'provisions',
      amount: 50,
      occurredOn: '2026-09-21',
      planYear: 2026,
      planMonth: 9,
      planSuggestedAmount: 46.67,
      plannedProvisions: 23.33,
    });
  });

  it('shows « Fait le … » once done, with the amount when it differs, and « Annuler »', async () => {
    const { unmount } = renderControl({
      state: 'done',
      id: 'mv-1',
      amount: 46.67,
      suggested: 46.67,
      occurredOn: '2026-09-18',
    });
    expect(screen.getByTestId('virement-fait').textContent).toContain('Fait le 18 septembre');
    expect(screen.getByTestId('virement-fait').textContent).not.toMatch(/€/);
    unmount();

    renderControl({
      state: 'done',
      id: 'mv-1',
      amount: 50,
      suggested: 46.67,
      occurredOn: '2026-09-18',
    });
    expect(screen.getByTestId('virement-fait').textContent).toMatch(/Fait le 18 septembre : 50\s€/);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(actions.cancel).toHaveBeenCalledWith({ id: 'mv-1', cancelled: true });
  });

  it('offers « Rétablir » on a cancelled line, next to the button that writes it again', async () => {
    renderControl({ state: 'todo', cancelledId: 'mv-9' });
    await userEvent.click(screen.getByRole('button', { name: 'Rétablir le virement annulé' }));
    expect(actions.cancel).toHaveBeenCalledWith({ id: 'mv-9', cancelled: false });
    expect(screen.getByRole('button', { name: /J’ai fait ce virement/ })).toBeTruthy();
  });
});
