/**
 * « Modifier la dépense » — the amount field.
 *
 * Same incident as the bill drawer: a `type="number"` field blanks a
 * comma-typed « 5,90 », `Number('')` is 0, and the expense was saved at 0 €.
 * The field is now text with a decimal keypad, read by the shared
 * `parseAmountInput`; « Enregistrer » waits for a readable amount and the field
 * says why. Typed key by key (`userEvent.type`). Figures are fictitious.
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

const INVALID_AMOUNT = 'Écris un montant supérieur à 0, avec une virgule ou un point.';

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

async function typeAmount(value: string) {
  const user = userEvent.setup();
  const field = screen.getByTestId('expense-edit-amount');
  await user.clear(field);
  if (value !== '') await user.type(field, value);
  return { user, field };
}

describe('ExpenseEditDrawer — the amount a francophone types', () => {
  beforeEach(() => {
    updateExpenseMock.mockReset();
    updateExpenseMock.mockResolvedValue({ ok: true });
  });

  it('is a text field with a decimal keypad, not a numeric field', () => {
    renderDrawer();
    const field = screen.getByTestId('expense-edit-amount');
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveAttribute('inputmode', 'decimal');
    expect(field).toHaveAttribute('autocomplete', 'off');
  });

  it('sends exactly { amount: 5.9 } when « 5,90 » is typed', async () => {
    renderDrawer();
    const { user } = await typeAmount('5,90');
    await user.click(screen.getByTestId('expense-edit-save'));
    await waitFor(() => expect(updateExpenseMock).toHaveBeenCalledTimes(1));
    expect(updateExpenseMock.mock.calls[0]?.[1]).toEqual({ amount: 5.9 });
  });

  it('says nothing while the amount is readable', () => {
    renderDrawer();
    expect(screen.queryByText(INVALID_AMOUNT)).toBeNull();
    expect(screen.getByTestId('expense-edit-amount')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('expense-edit-save')).toBeEnabled();
  });

  it.each([
    ['an empty field', ''],
    ['letters', 'abc'],
    ['zero', '0'],
  ])('refuses %s: Enregistrer waits, and the field says why', async (_label, value) => {
    renderDrawer();
    const { user, field } = await typeAmount(value);

    const save = screen.getByTestId('expense-edit-save');
    expect(save).toBeDisabled();
    const message = screen.getByText(INVALID_AMOUNT);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(message.id).not.toBe('');
    expect(field.getAttribute('aria-describedby') ?? '').toContain(message.id);

    await user.click(save);
    expect(updateExpenseMock).not.toHaveBeenCalled();
  });
});
