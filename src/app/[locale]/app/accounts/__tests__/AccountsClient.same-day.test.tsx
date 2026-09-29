import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const actions = vi.hoisted(() => ({
  setIncluded: vi.fn(async (_input: unknown) => ({ ok: true })),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: actions.refresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/actions/accounts', () => ({
  updateMonthlyIncomeAction: vi.fn(),
  updateVieCouranteTransferAction: vi.fn(),
}));
vi.mock('@/lib/actions/operations', () => ({
  setFlowIncludedAction: actions.setIncluded,
  recordBalanceStatementAction: vi.fn(),
  recordIncomeAction: vi.fn(),
  setMovementCancelledAction: vi.fn(),
  setStatementCancelledAction: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AccountsClient, type AccountBalanceProps } from '../AccountsClient';

/*
 * ADR-045 D23 — the card names EACH same-day operation written after the read
 * balance, and each one gets its own answer: « Déjà dedans » or « Fait après ».
 * One answer for the whole group (D21) could not say that a bill already
 * debited was inside the reading while an expense made later was not.
 */

const SID = '4b0f6c1e-2d3a-4e5f-8a9b-0c1d2e3f4a5b';
const BILL = 'charge_payment:0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const SPEND = 'expense:1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
type Flow = {
  id: string;
  direction: 'in' | 'out';
  amount: number;
  origin: 'income' | 'transfer' | 'bill' | 'expense';
};

// Fictional figures (famille 505 € / 705 €).
const row = (flows: Flow[], included: Flow[]): AccountBalanceProps => ({
  kind: 'principal',
  accountType: 'income_bills',
  label: 'Compte revenus',
  view: {
    readId: SID,
    readBalance: 505,
    readStatedOn: '2026-09-28',
    readIsStartingBalance: false,
    computed: flows.length > 0 ? 500 : null,
    operations: flows.length,
    gap: null,
    reopenable: null,
    sameDayAfter: { flows, included },
  },
});

const bill: Flow = { id: BILL, direction: 'out', amount: 2.99, origin: 'bill' };
const spend: Flow = { id: SPEND, direction: 'out', amount: 5, origin: 'expense' };

function renderWith(balance: AccountBalanceProps) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <AccountsClient
        monthlyIncome={null}
        vieCouranteMonthlyTransfer={null}
        balances={[balance]}
        today="2026-09-29"
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  actions.setIncluded.mockClear();
  actions.refresh.mockClear();
});

describe('AccountBalanceCard — one answer per same-day operation (ADR-045 D23)', () => {
  it('names both operations, each with its own two answers, and shows the current one', () => {
    renderWith(row([spend], [bill]));
    const list = screen.getByTestId('sameday-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId(`sameday-included-${BILL}`)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId(`sameday-after-${BILL}`)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId(`sameday-included-${SPEND}`)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId(`sameday-after-${SPEND}`)).toHaveAttribute('aria-pressed', 'true');
  });

  it('« Déjà dedans » on one line sends THAT operation only', async () => {
    renderWith(row([spend, bill], []));
    await userEvent.click(screen.getByTestId(`sameday-included-${BILL}`));
    expect(actions.setIncluded).toHaveBeenCalledTimes(1);
    expect(actions.setIncluded).toHaveBeenCalledWith({
      statementId: SID,
      flowId: BILL,
      included: true,
    });
    expect(actions.refresh).toHaveBeenCalled();
  });

  it('an answer is undone in one click at the same place (rule 11)', async () => {
    renderWith(row([spend], [bill]));
    await userEvent.click(screen.getByTestId(`sameday-after-${BILL}`));
    expect(actions.setIncluded).toHaveBeenCalledWith({
      statementId: SID,
      flowId: BILL,
      included: false,
    });
  });

  it('clicking the answer already given writes nothing', async () => {
    renderWith(row([spend], [bill]));
    await userEvent.click(screen.getByTestId(`sameday-included-${BILL}`));
    await userEvent.click(screen.getByTestId(`sameday-after-${SPEND}`));
    expect(actions.setIncluded).not.toHaveBeenCalled();
  });

  it('stays on screen when every operation is answered « Déjà dedans »', () => {
    renderWith(row([], [bill, spend]));
    expect(within(screen.getByTestId('sameday-list')).getAllByRole('listitem')).toHaveLength(2);
  });
});
