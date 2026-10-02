/**
 * « Modifier la dépense » — a refused date says it is the date.
 *
 * The add sheet already names the date field when the server refuses a day
 * after today; the edit drawer only showed the generic failure toast. Figures
 * and names are fictitious.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const updateExpenseMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/expenses', () => ({
  updateExpenseAction: updateExpenseMock,
  deleteExpenseAction: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { ExpenseEditDrawer, type ExpenseEditDrawerExpense } from '../ExpenseEditDrawer';

const FUTURE_DATE_MESSAGE = 'La date ne peut pas être dans le futur.';

const EXPENSE: ExpenseEditDrawerExpense = {
  id: '5b2e9d10-4c7a-4f3e-8b6d-1a9c0e7f2d34',
  label: 'Pharmacie',
  amount: 505,
  occurredOn: '2026-09-21',
  note: null,
  paidFrom: 'vie_courante',
};

function renderDrawer() {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <ExpenseEditDrawer expense={EXPENSE} accounts={[]} onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe('ExpenseEditDrawer — a refused date', () => {
  beforeEach(() => {
    updateExpenseMock.mockReset();
    updateExpenseMock.mockResolvedValue({
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: { occurredOn: ['operations.date.future'] },
    });
  });

  async function submitFutureDate() {
    const user = userEvent.setup();
    const date = screen.getByTestId('expense-edit-occurred-on');
    await user.clear(date);
    await user.type(date, '2099-01-01');
    await user.click(screen.getByTestId('expense-edit-save'));
    return { user, date };
  }

  it('names the date under its field, linked to the field', async () => {
    renderDrawer();
    const { date } = await submitFutureDate();
    const alert = await screen.findByTestId('expense-edit-date-error');
    expect(alert).toHaveTextContent(FUTURE_DATE_MESSAGE);
    expect(alert).toHaveAttribute('role', 'alert');
    expect(date).toHaveAttribute('aria-invalid', 'true');
    expect(date.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('forgets the message when the drawer is closed and reopened', async () => {
    const { rerender } = renderDrawer();
    await submitFutureDate();
    await screen.findByTestId('expense-edit-date-error');
    const withDrawer = (expense: ExpenseEditDrawerExpense | null) => (
      <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
        <ExpenseEditDrawer expense={expense} accounts={[]} onClose={() => {}} />
      </NextIntlClientProvider>
    );
    rerender(withDrawer(null));
    rerender(withDrawer(EXPENSE));
    expect(screen.queryByTestId('expense-edit-date-error')).toBeNull();
  });

  it('clears the message as soon as the date is touched again', async () => {
    renderDrawer();
    const { user, date } = await submitFutureDate();
    await screen.findByTestId('expense-edit-date-error');
    await user.clear(date);
    await waitFor(() => expect(screen.queryByTestId('expense-edit-date-error')).toBeNull());
  });
});
