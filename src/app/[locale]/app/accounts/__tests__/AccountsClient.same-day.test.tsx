import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const actions = vi.hoisted(() => ({
  confirm: vi.fn(async (_input: unknown) => ({ ok: true })),
}));
vi.mock('@/lib/actions/accounts', () => ({
  updateMonthlyIncomeAction: vi.fn(),
  updateVieCouranteTransferAction: vi.fn(),
}));
vi.mock('@/lib/actions/operations', () => ({
  confirmStatementIncludedAction: actions.confirm,
  recordBalanceStatementAction: vi.fn(),
  recordIncomeAction: vi.fn(),
  setMovementCancelledAction: vi.fn(),
  setStatementCancelledAction: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AccountsClient, type AccountBalanceProps } from '../AccountsClient';

/*
 * ADR-045 D21 — the card names the same-day operations written after the read
 * balance, and offers to say that balance already held them.
 */

const SID = '4b0f6c1e-2d3a-4e5f-8a9b-0c1d2e3f4a5b';
// Fictional figures (famille 505 € / 705 €).
const row = (sameDayAfter: { total: number } | null): AccountBalanceProps => ({
  kind: 'principal',
  accountType: 'income_bills',
  label: 'Compte revenus',
  view: {
    readId: SID,
    readBalance: 705,
    readStatedOn: '2026-09-28',
    readIsStartingBalance: false,
    computed: 1410,
    gap: null,
    reopenable: null,
    sameDayAfter,
  },
});

function renderWith(balance: AccountBalanceProps) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <AccountsClient
        monthlyIncome={null}
        vieCouranteMonthlyTransfer={null}
        balances={[balance]}
        today="2026-09-28"
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => actions.confirm.mockClear());

describe('AccountBalanceCard — same-day operations after the read balance', () => {
  it('names them under « Calculé depuis tes opérations », and the action sends the statement id only', async () => {
    renderWith(row({ total: 705 }));
    const line = screen.getByTestId('meme-jour');
    expect(within(screen.getByTestId('solde-calcule')).getByTestId('meme-jour')).toBe(line);
    expect(line.textContent).toMatch(
      /dont 705[\u00a0\u202f]€ reçus le 28 septembre, écrits après ton solde du même jour/,
    );
    await userEvent.click(
      within(line).getByRole('button', { name: 'Mon solde du 28 septembre les contenait déjà' }),
    );
    expect(actions.confirm).toHaveBeenCalledWith({ statementId: SID });
  });

  it('says « de sorties » when the day only took money out (transfers, bills or spending — D22)', () => {
    renderWith(row({ total: -505 }));
    expect(screen.getByTestId('meme-jour').textContent).toMatch(
      /dont 505[\u00a0\u202f]€ de sorties/,
    );
  });

  it('shows nothing when no operation of that day counts after the balance', () => {
    renderWith(row(null));
    expect(screen.queryByTestId('meme-jour')).toBeNull();
  });
});
