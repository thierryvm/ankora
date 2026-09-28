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
 * balance and ASKS whether that balance already held them, both answers
 * visible (tour 55). It used to show a single net under one verb (« dont 395 €
 * reçus » for +505 and −110) and one button that invited the wrong answer when
 * the operations really happened after the balance was read.
 */

const SID = '4b0f6c1e-2d3a-4e5f-8a9b-0c1d2e3f4a5b';
type Flow = {
  id: string;
  direction: 'in' | 'out';
  amount: number;
  origin: 'income' | 'transfer' | 'bill' | 'expense';
};
// Fictional figures (famille 505 € / 705 €).
const row = (flows: Flow[] | null): AccountBalanceProps => ({
  kind: 'principal',
  accountType: 'income_bills',
  label: 'Compte revenus',
  view: {
    readId: SID,
    readBalance: 705,
    readStatedOn: '2026-09-28',
    readIsStartingBalance: false,
    computed: 1100,
    // Same-day flows come after the statement: each is an operation since.
    operations: Math.max(1, flows?.length ?? 0),
    gap: null,
    reopenable: null,
    sameDayAfter: flows && { flows },
  },
});

const NBSP = '[  ]';
const MIXED: Flow[] = [
  { id: 'mv-1:in', direction: 'in', amount: 505, origin: 'transfer' },
  { id: 'ex-1', direction: 'out', amount: 110, origin: 'expense' },
];

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

beforeEach(() => {
  actions.confirm.mockClear();
  window.localStorage.clear();
});

describe('AccountBalanceCard — same-day operations after the read balance', () => {
  it('opens on each operation with its sign and its kind, never a net under one verb', () => {
    renderWith(row(MIXED));
    const line = screen.getByTestId('meme-jour');
    expect(within(screen.getByTestId('solde-calcule')).getByTestId('meme-jour')).toBe(line);
    const items = within(line)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toMatch(new RegExp(`^[+] 505${NBSP}€ · virement$`));
    expect(items[1]).toMatch(new RegExp(`^− 110${NBSP}€ · dépense$`));
    expect(line.textContent).not.toMatch(/395/);
    expect(line.textContent).not.toMatch(/reçus/);
  });

  it('asks a question with both answers visible; « Oui » sends the statement id only', async () => {
    renderWith(row(MIXED));
    const line = screen.getByTestId('meme-jour');
    expect(line.textContent).toMatch(
      /Ton solde du 28 septembre contenait-il déjà ces opérations \?/,
    );
    const no = within(line).getByRole('button', { name: 'Non, fait après' });
    expect(no).toBeVisible();
    await userEvent.click(within(line).getByRole('button', { name: 'Oui, déjà dedans' }));
    expect(actions.confirm).toHaveBeenCalledWith({ statementId: SID });
  });

  it('« Non, fait après » puts the line away without writing anything, and it stays away', async () => {
    const { unmount } = renderWith(row(MIXED));
    await userEvent.click(screen.getByRole('button', { name: 'Non, fait après' }));
    expect(screen.queryByTestId('meme-jour')).toBeNull();
    expect(actions.confirm).not.toHaveBeenCalled();
    unmount();
    renderWith(row(MIXED));
    expect(screen.queryByTestId('meme-jour')).toBeNull();
  });

  it('asks again when a new operation of that day arrives after the answer', async () => {
    const { unmount } = renderWith(row(MIXED));
    await userEvent.click(screen.getByRole('button', { name: 'Non, fait après' }));
    unmount();
    renderWith(row([...MIXED, { id: 'ex-2', direction: 'out', amount: 5, origin: 'expense' }]));
    expect(screen.getByTestId('meme-jour')).toBeTruthy();
  });

  it('shows nothing when no operation of that day counts after the balance', () => {
    renderWith(row(null));
    expect(screen.queryByTestId('meme-jour')).toBeNull();
  });
});
