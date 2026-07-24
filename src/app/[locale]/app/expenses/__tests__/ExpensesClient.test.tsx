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

type RenderOpts = {
  resteAVivre?: number;
  currentYear?: number;
  currentMonth?: number;
  joursRestants?: number;
};

/** Default month = May 2026 so the sample expenses count as « this month ». */
function renderExpenses(expenses = sampleExpenses, opts: RenderOpts = {}) {
  return renderWithIntl(
    <ExpensesClient
      expenses={expenses}
      resteAVivre={opts.resteAVivre ?? 500}
      currentYear={opts.currentYear ?? 2026}
      currentMonth={opts.currentMonth ?? 5}
      joursRestants={opts.joursRestants ?? 10}
    />,
  );
}

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
    renderExpenses();
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
    renderExpenses();
    expect(screen.getByTestId('expenses-row-edit-e1')).toBeInTheDocument();
    expect(screen.getByTestId('expenses-row-delete-e1')).toBeInTheDocument();
    expect(screen.getByTestId('expenses-row-edit-e2')).toBeInTheDocument();
    expect(screen.getByTestId('expenses-row-delete-e2')).toBeInTheDocument();
  });

  it('exposes an editAria localised label naming the expense', () => {
    renderExpenses();
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
    renderExpenses();
    expect(screen.queryByTestId('expense-edit-drawer')).toBeNull();
    fireEvent.click(screen.getByTestId('expenses-row-edit-e1'));
    expect(await screen.findByTestId('expense-edit-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('expense-edit-label')).toHaveValue('Courses Carrefour');
    expect(screen.getByTestId('expense-edit-amount')).toHaveValue(87.5);
    expect(screen.getByTestId('expense-edit-occurred-on')).toHaveValue('2026-05-15');
  });

  it('calls updateExpenseAction on Save and closes the drawer on success', async () => {
    updateExpenseMock.mockResolvedValue({ ok: true });
    renderExpenses();
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
    renderExpenses();
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

describe('<ExpensesClient /> — reste à vivre (this-month budget)', () => {
  it('shows the remaining living budget and a per-day figure for the current month', () => {
    renderExpenses(); // budget 500, spent 87.5 + 42 = 129.5 this month → 370.5 left
    expect(screen.getByTestId('reste-a-vivre-remaining')).toHaveTextContent(/370/);
    expect(screen.getByTestId('reste-a-vivre-perday')).toBeInTheDocument();
    expect(screen.queryByTestId('reste-a-vivre-over')).toBeNull();
  });

  it('flags an over-budget month and drops the per-day figure', () => {
    renderExpenses(sampleExpenses, { resteAVivre: 100 }); // spent 129.5 > 100
    expect(screen.getByTestId('reste-a-vivre-over')).toBeInTheDocument();
    expect(screen.queryByTestId('reste-a-vivre-perday')).toBeNull();
  });

  it('splits current-month from earlier months into a collapsible section', () => {
    const mixed = [
      sampleExpenses[0]!, // e1 — May (this month)
      { id: 'e3', label: 'Avril lointain', amount: 20, occurredOn: '2026-04-10', note: null },
    ];
    renderExpenses(mixed);
    // Current-month list has only e1; e3 lives in the « earlier months » details.
    const list = screen.getByTestId('expenses-list');
    expect(within(list).getByTestId('expenses-row-e1')).toBeInTheDocument();
    expect(within(list).queryByTestId('expenses-row-e3')).toBeNull();
    const earlier = screen.getByTestId('expenses-earlier');
    expect(within(earlier).getByTestId('expenses-row-e3')).toBeInTheDocument();
    // Only e1 (87.5) counts against the budget → 412.5 left.
    expect(screen.getByTestId('reste-a-vivre-remaining')).toHaveTextContent(/412/);
  });

  it('has no earlier section when every expense is in the current month', () => {
    renderExpenses();
    expect(screen.queryByTestId('expenses-earlier')).toBeNull();
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
