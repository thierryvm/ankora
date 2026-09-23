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

/**
 * The inline add form was replaced by the shared entry sheet (chantier 2), which
 * reaches for a `'use server'` module and therefore for validated env vars.
 * Stubbed to a marker: this suite is about the list and the edit drawer.
 * `AddExpenseSheet` has its own suite in `src/components/expenses/__tests__/`.
 */
vi.mock('@/components/expenses/AddExpenseSheet', () => ({
  AddExpenseSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-expense-sheet-mock" /> : null,
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
  spentThisMonth?: number;
  currentYear?: number;
  currentMonth?: number;
  joursEcoules?: number;
};

/** Default month = May 2026 so the sample expenses count as « this month ». */
function renderExpenses(expenses = sampleExpenses, opts: RenderOpts = {}) {
  const cy = opts.currentYear ?? 2026;
  const cm = opts.currentMonth ?? 5;
  // Default the authoritative total to the current-month sum of the passed list,
  // so tests that don't care about pagination stay consistent with the widget.
  const prefix = `${cy}-${String(cm).padStart(2, '0')}`;
  const spentThisMonth =
    opts.spentThisMonth ??
    expenses.filter((e) => e.occurredOn.startsWith(prefix)).reduce((a, e) => a + e.amount, 0);
  return renderWithIntl(
    <ExpensesClient
      expenses={expenses}
      spentThisMonth={spentThisMonth}
      currentYear={cy}
      currentMonth={cm}
      joursEcoules={opts.joursEcoules ?? 20}
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

  it('makes the whole row the edit target', () => {
    // Was: "exposes both Modifier and Supprimer buttons per row". The row used
    // to carry a muted pencil beside a red bin, and the eye went to the bin —
    // @thierry believed for weeks that expenses could not be edited at all.
    renderExpenses();
    expect(screen.getByTestId('expenses-row-edit-e1')).toBeInTheDocument();
    expect(screen.getByTestId('expenses-row-edit-e2')).toBeInTheDocument();
  });

  it('offers no way to delete from the list', () => {
    // Structural, not cosmetic: an irreversible action one stray tap away in a
    // scrolling list, with no confirmation, is the defect being removed.
    // Deleting now lives inside the drawer, behind a confirmation that names
    // the expense and its amount.
    renderExpenses();
    expect(screen.queryByTestId('expenses-row-delete-e1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expenses-row-delete-e2')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /supprimer/i })).not.toBeInTheDocument();
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

describe('<ExpensesClient /> — « Dépensé ce mois » (ADR-035)', () => {
  it('shows the month total and the average daily rate so far', () => {
    renderExpenses(); // spent 87.5 + 42 = 129.5 this month
    expect(screen.getByTestId('depense-mois-total')).toHaveTextContent(/129/);
    expect(screen.getByTestId('depense-mois-perday')).toBeInTheDocument();
  });

  it('no longer scores the month against an envelope', () => {
    // ADR-035 — the progress bar and the « dépassé » badge measured spending
    // against `reste_a_vivre_default`, a 500 € constant most users never chose.
    // Both are gone; nothing here derives from a number the user did not enter.
    renderExpenses();
    expect(screen.queryByTestId('reste-a-vivre-bar')).toBeNull();
    expect(screen.queryByTestId('reste-a-vivre-over')).toBeNull();
    expect(screen.queryByTestId('reste-a-vivre-remaining')).toBeNull();
  });

  it('takes the total from the authoritative spentThisMonth, not the capped list', () => {
    // Only 2 rows are loaded (list capped at 50), but the true month total is 300.
    // Sourcery #242 — past the 51st expense the visible rows under-report.
    renderExpenses(sampleExpenses, { spentThisMonth: 300 });
    expect(screen.getByTestId('depense-mois-total')).toHaveTextContent(/300/);
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
    // Only e1 (87.5) is in the current month, so that is the month total.
    expect(screen.getByTestId('depense-mois-total')).toHaveTextContent(/87/);
  });

  it('has no earlier section when every expense is in the current month', () => {
    renderExpenses();
    expect(screen.queryByTestId('expenses-earlier')).toBeNull();
  });

  it('shows the empty-state + earlier section when nothing is from this month', () => {
    const earlierOnly = [
      { id: 'e3', label: 'Avril lointain', amount: 20, occurredOn: '2026-04-10', note: null },
    ];
    renderExpenses(earlierOnly);
    // No current-month list — the empty-state message stands in.
    expect(screen.getByTestId('expenses-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('expenses-list')).toBeNull();
    // The earlier expense still lives in the collapsible « Mois précédents ».
    const earlier = screen.getByTestId('expenses-earlier');
    expect(within(earlier).getByTestId('expenses-row-e3')).toBeInTheDocument();
    // Nothing spent this month → the total reads zero, not a leftover budget.
    expect(screen.getByTestId('depense-mois-total')).toHaveTextContent(/0/);
  });
});

/**
 * The month, grouped by description — « where did it go? ». Rule 10: the month
 * total opens on what composes it, so the groups must add up to it exactly.
 */
describe('<ExpensesClient /> — the month grouped by description', () => {
  const month = [
    { id: 'g1', label: 'Colruyt', amount: 5.05, occurredOn: '2026-05-02', note: null },
    { id: 'g2', label: 'Pharmacie', amount: 50.5, occurredOn: '2026-05-03', note: null },
    { id: 'g3', label: 'COLRUYT', amount: 7.05, occurredOn: '2026-05-10', note: null },
    { id: 'g4', label: 'Boulangerie', amount: 0.1, occurredOn: '2026-05-11', note: null },
    { id: 'g5', label: 'boulangerie', amount: 0.2, occurredOn: '2026-05-12', note: null },
  ];
  const earlier = {
    id: 'g0',
    label: 'Colruyt',
    amount: 70.5,
    occurredOn: '2026-04-28',
    note: null,
  };

  const groups = () => screen.getAllByTestId('expense-group');
  const cents = (el: HTMLElement) => Number(el.getAttribute('data-sous-total'));
  // The name a group shows: its title, or — for a group of one — its only row.
  const shownName = (g: HTMLElement) =>
    (within(g).queryByTestId('expense-group-label') ?? within(g).getByTestId('expenses-row-label'))
      .textContent;

  it('shows one group per description, the largest subtotal first', () => {
    renderExpenses([...month, earlier]);
    expect(groups().map(shownName)).toEqual(['Pharmacie', 'COLRUYT', 'boulangerie']);
    expect(groups().map(cents)).toEqual([5050, 1210, 30]);
  });

  /*
    A group of ONE expense is a plain row. A title repeating the row's own
    description, over a subtotal repeating the row's own amount, doubled every
    single-expense place on the list and said nothing the row did not.
  */
  it('renders a group of one expense as a plain row, without title or repeated subtotal', () => {
    renderExpenses(month);
    const pharmacie = groups()[0]!;
    expect(within(pharmacie).queryByTestId('expense-group-label')).toBeNull();
    expect(within(pharmacie).queryByTestId('expense-group-subtotal')).toBeNull();
    expect(within(pharmacie).queryByRole('heading')).toBeNull();
    // The row itself is complete: description, date, amount, edit target.
    expect(within(pharmacie).getByTestId('expenses-row-label')).toHaveTextContent('Pharmacie');
    expect(within(pharmacie).getByTestId('expenses-row-date')).toBeInTheDocument();
    expect(within(pharmacie).getByTestId('expenses-row-amount')).toHaveTextContent(/50,50/);
    expect(within(pharmacie).getByTestId('expenses-row-edit-g2')).toBeInTheDocument();
    // …and it still counts as one line of the month's decomposition.
    expect(cents(pharmacie)).toBe(5050);
    expect(within(pharmacie).getAllByTestId('expenses-row-amount')).toHaveLength(1);
  });

  it('gives a group of two or more expenses its title and subtotal, then its rows', () => {
    renderExpenses(month);
    const colruyt = groups()[1]!;
    const title = within(colruyt).getByTestId('expense-group-label');
    expect(title).toHaveTextContent('COLRUYT');
    expect(within(colruyt).getByTestId('expense-group-subtotal')).toHaveTextContent(/12,10/);
    const rows = within(colruyt).getAllByTestId('expenses-row-label');
    expect(rows).toHaveLength(2);
    // The title comes before the rows it sums.
    expect(title.compareDocumentPosition(rows[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the subtotals add up to the month total with only groups of one, too', () => {
    renderExpenses(sampleExpenses); // two places, one expense each: 87,50 + 42
    expect(groups()).toHaveLength(2);
    for (const g of groups()) {
      expect(within(g).queryByTestId('expense-group-label')).toBeNull();
    }
    expect(
      groups()
        .map(cents)
        .reduce((a, b) => a + b, 0),
    ).toBe(12950);
    expect(screen.getByTestId('depense-mois-total')).toHaveTextContent(/129,50/);
  });

  it('shows each subtotal formatted, in the group title', () => {
    renderExpenses(month);
    expect(within(groups()[1]!).getByTestId('expense-group-subtotal')).toHaveTextContent(/12,10/);
  });

  it('keeps each row — and its edit target — under its group', () => {
    renderExpenses(month);
    const colruyt = groups()[1]!;
    expect(within(colruyt).getByTestId('expenses-row-edit-g1')).toBeInTheDocument();
    expect(within(colruyt).getByTestId('expenses-row-edit-g3')).toBeInTheDocument();
    expect(within(colruyt).queryByTestId('expenses-row-g2')).toBeNull();
    // The date is still on each row.
    expect(within(colruyt).getAllByTestId('expenses-row-date')).toHaveLength(2);
  });

  it('the subtotals add up to the month total, to the cent', () => {
    renderExpenses([...month, earlier]);
    const sum = groups()
      .map(cents)
      .reduce((a, b) => a + b, 0);
    // 5,05 + 50,50 + 7,05 + 0,10 + 0,20 = 62,90 — and the April row is not in it.
    expect(sum).toBe(6290);
    expect(screen.getByTestId('depense-mois-total')).toHaveTextContent(/62,90/);
  });

  it('leaves earlier months as they were, ungrouped', () => {
    renderExpenses([...month, earlier]);
    const before = screen.getByTestId('expenses-earlier');
    expect(within(before).getByTestId('expenses-row-g0')).toBeInTheDocument();
    expect(within(before).queryByTestId('expense-group')).toBeNull();
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
              delete?: string;
              deleting?: string;
              confirmDelete?: string;
              confirmDeleteAction?: string;
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
      // Delete moved into the drawer; its confirmation must exist everywhere,
      // or a locale silently renders a raw key on a destructive action.
      expect(e.drawer?.delete).toBeTypeOf('string');
      expect(e.drawer?.deleting).toBeTypeOf('string');
      expect(e.drawer?.confirmDelete).toBeTypeOf('string');
      expect(e.drawer?.confirmDeleteAction).toBeTypeOf('string');
    },
  );

  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s keeps the delete confirmation placeholders intact',
    async (locale) => {
      const m = (await import(`../../../../../../messages/${locale}.json`)).default as {
        app: { expenses: { drawer: Record<string, string> } };
      };
      const confirm = m.app.expenses.drawer.confirmDelete ?? '';
      // A confirmation that names nothing is a confirmation nobody reads: both
      // the label and the amount have to survive translation.
      expect(confirm).toContain('{label}');
      expect(confirm).toContain('{amount}');
    },
  );

  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s exposes the reste-à-vivre keys with intact placeholders',
    async (locale) => {
      const m = (await import(`../../../../../../messages/${locale}.json`)).default as {
        app: { expenses: Record<string, string> };
      };
      const e = m.app.expenses;
      const has = (key: string, tokens: string[]) => {
        expect(e[key]).toBeTypeOf('string');
        for (const tok of tokens) expect(e[key] ?? '').toContain(tok);
      };
      has('depenseMoisLabel', ['{month}']);
      has('perDayElapsed', ['{amount}', '{days}']);
      // ADR-035 — these five keys described the envelope and are gone. Pinning
      // their absence stops a copy-paste from resurrecting the vocabulary.
      for (const gone of ['resteAVivreLabel', 'overBudget', 'spentOfBudget', 'perDay', 'barAria']) {
        expect(e[gone], `${locale} → app.expenses.${gone} should be gone`).toBeUndefined();
      }
      has('earlierToggle', ['{count}']);
    },
  );
});
