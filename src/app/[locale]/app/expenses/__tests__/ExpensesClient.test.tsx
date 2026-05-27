/**
 * ExpensesClient + ExpenseEditDrawer unit tests — PR-BETA-CLEANUP-3.
 *
 * Mirrors the pattern adopted on ChargesClient in PR-BETA-CLEANUP-2:
 * NextIntlClientProvider with real fr-BE messages, action mocks via
 * `vi.hoisted`, drawer integration asserted through `data-testid` hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const createExpenseMock = vi.hoisted(() => vi.fn());
const updateExpenseMock = vi.hoisted(() => vi.fn());
const deleteExpenseMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const routerRefreshMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/expenses', () => ({
  createExpenseAction: createExpenseMock,
  updateExpenseAction: updateExpenseMock,
  deleteExpenseAction: deleteExpenseMock,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { ExpensesClient } from '../ExpensesClient';

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      {ui}
    </NextIntlClientProvider>,
  );
}

const sampleExpenses = [
  {
    id: 'e1',
    label: 'Courses Carrefour',
    amount: 87.5,
    occurredOn: '2026-05-15',
    note: null,
  },
  {
    id: 'e2',
    label: 'Resto avec Léna',
    amount: 42,
    occurredOn: '2026-05-22',
    note: null,
  },
];

describe('<ExpensesClient /> — PR-BETA-CLEANUP-3 list (date locale + edit button)', () => {
  beforeEach(() => {
    createExpenseMock.mockReset();
    updateExpenseMock.mockReset();
    deleteExpenseMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it('renders the locale-aware date (medium style) for each row, not the raw ISO', () => {
    renderWithIntl(<ExpensesClient expenses={sampleExpenses} />);
    const firstRow = screen.getByTestId('expenses-row-e1');
    const dateCell = within(firstRow).getByTestId('expenses-row-date');
    // 4-digit year present (formatDate medium) — no longer the raw
    // "2026-05-15" pumped from the DB. We deliberately do NOT assert the
    // exact French rendering since `Intl.DateTimeFormat('fr-BE', medium)`
    // implementation may shift across Node versions.
    expect(dateCell.textContent ?? '').toMatch(/2026/);
    // The raw ISO chunk should NOT leak through verbatim.
    expect(dateCell.textContent ?? '').not.toBe('2026-05-15');
  });

  it('exposes both Modifier and Supprimer buttons per row', () => {
    renderWithIntl(<ExpensesClient expenses={sampleExpenses} />);
    expect(screen.getByTestId('expenses-row-edit-e1')).toBeInTheDocument();
    expect(screen.getByTestId('expenses-row-delete-e1')).toBeInTheDocument();
    expect(screen.getByTestId('expenses-row-edit-e2')).toBeInTheDocument();
    expect(screen.getByTestId('expenses-row-delete-e2')).toBeInTheDocument();
  });

  it('exposes an editAria localised label naming the expense', () => {
    renderWithIntl(<ExpensesClient expenses={sampleExpenses} />);
    expect(screen.getByRole('button', { name: 'Modifier Courses Carrefour' })).toBeInTheDocument();
  });
});

describe('<ExpensesClient /> — PR-BETA-CLEANUP-3 edit drawer', () => {
  beforeEach(() => {
    createExpenseMock.mockReset();
    updateExpenseMock.mockReset();
    deleteExpenseMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it('opens the drawer with pre-filled fields when Modifier is clicked', async () => {
    renderWithIntl(<ExpensesClient expenses={sampleExpenses} />);
    expect(screen.queryByTestId('expense-edit-drawer')).toBeNull();
    fireEvent.click(screen.getByTestId('expenses-row-edit-e1'));
    expect(await screen.findByTestId('expense-edit-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('expense-edit-label')).toHaveValue('Courses Carrefour');
    expect(screen.getByTestId('expense-edit-amount')).toHaveValue(87.5);
    expect(screen.getByTestId('expense-edit-occurred-on')).toHaveValue('2026-05-15');
  });

  it('calls updateExpenseAction on Save and closes the drawer on success', async () => {
    updateExpenseMock.mockResolvedValue({ ok: true });
    renderWithIntl(<ExpensesClient expenses={sampleExpenses} />);
    fireEvent.click(screen.getByTestId('expenses-row-edit-e1'));
    await screen.findByTestId('expense-edit-drawer');
    fireEvent.change(screen.getByTestId('expense-edit-amount'), { target: { value: '95' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('expense-edit-save'));
    });
    await waitFor(() => expect(updateExpenseMock).toHaveBeenCalledTimes(1));
    expect(updateExpenseMock.mock.calls[0]?.[0]).toBe('e1');
    expect(updateExpenseMock.mock.calls[0]?.[1]).toMatchObject({
      amount: 95,
      label: 'Courses Carrefour',
      occurredOn: '2026-05-15',
    });
    await waitFor(() => expect(screen.queryByTestId('expense-edit-drawer')).toBeNull());
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the drawer open and shows a toast error on update failure', async () => {
    updateExpenseMock.mockResolvedValue({
      ok: false,
      errorCode: 'errors.expenses.updateFailed',
    });
    renderWithIntl(<ExpensesClient expenses={sampleExpenses} />);
    fireEvent.click(screen.getByTestId('expenses-row-edit-e1'));
    await screen.findByTestId('expense-edit-drawer');
    await act(async () => {
      fireEvent.click(screen.getByTestId('expense-edit-save'));
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('expense-edit-drawer')).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});

describe('app.expenses — i18n parity (5 locales, PR-BETA-CLEANUP-3)', () => {
  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s exposes editAria + toastUpdated + drawer.{title,save,saving,cancel,errorGeneric}',
    async (locale) => {
      const m = (await import(`../../../../../../messages/${locale}.json`)).default as {
        app: {
          expenses: {
            editAria?: string;
            toastUpdated?: string;
            drawer?: {
              title?: string;
              save?: string;
              saving?: string;
              cancel?: string;
              errorGeneric?: string;
            };
          };
        };
      };
      const e = m.app.expenses;
      expect(e.editAria).toBeTypeOf('string');
      expect((e.editAria ?? '').includes('{label}')).toBe(true);
      expect(e.toastUpdated).toBeTypeOf('string');
      expect((e.toastUpdated ?? '').length).toBeGreaterThan(0);
      expect(e.drawer?.title).toBeTypeOf('string');
      expect(e.drawer?.save).toBeTypeOf('string');
      expect(e.drawer?.saving).toBeTypeOf('string');
      expect(e.drawer?.cancel).toBeTypeOf('string');
      expect(e.drawer?.errorGeneric).toBeTypeOf('string');
    },
  );
});
