/**
 * ChargesClient unit tests — PR-BETA-1 (THI-265).
 *
 * Scope: visual refactor of the charges list. Tests assert the structural
 * contract of the refactored layout (semantic roles, ARIA, column data) —
 * NOT exact Tailwind classes. Visual layout (grid baseline, mobile stack,
 * touch targets) is asserted by the Playwright specs under e2e/charges/.
 *
 * Pattern mirrored from src/components/features/__tests__/AccountCardEditableTitle.test.tsx
 * — NextIntlClientProvider with real fr-BE messages, action mocks via vi.hoisted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const createChargeMock = vi.hoisted(() => vi.fn());
const updateChargeMock = vi.hoisted(() => vi.fn());
const deleteChargeMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const routerRefreshMock = vi.hoisted(() => vi.fn());
const togglePaymentMock = vi.hoisted(() => vi.fn());
const toggleWatchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/charges', () => ({
  createChargeAction: createChargeMock,
  updateChargeAction: updateChargeMock,
  deleteChargeAction: deleteChargeMock,
  toggleWatchAction: toggleWatchMock,
}));

vi.mock('@/lib/actions/charge-payments', () => ({
  togglePaymentAction: togglePaymentMock,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { ChargesClient } from '../ChargesClient';

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      {ui}
    </NextIntlClientProvider>,
  );
}

type ChargesClientProps = React.ComponentProps<typeof ChargesClient>;

const ZERO_SUBTOTALS: ChargesClientProps['subtotals'] = {
  monthly: 0,
  quarterly: 0,
  semiannual: 0,
  annual: 0,
};

/**
 * Render the client with the server-computed money props. Totals default to 0
 * (server-side concern, exercised explicitly by the totals tests below) so the
 * existing structural tests stay focused on layout, not arithmetic.
 */
function renderCharges(
  charges: ChargesClientProps['charges'],
  overrides: Partial<Omit<ChargesClientProps, 'charges'>> = {},
) {
  return renderWithIntl(
    <ChargesClient
      charges={charges}
      subtotals={overrides.subtotals ?? ZERO_SUBTOTALS}
      monthlyProvisionTotal={overrides.monthlyProvisionTotal ?? 0}
      annualTotal={overrides.annualTotal ?? 0}
      paidChargeIds={overrides.paidChargeIds ?? []}
      currentPeriod={overrides.currentPeriod ?? { year: 2026, month: 1 }}
    />,
  );
}

const sampleCharges = [
  {
    id: 'a1',
    label: 'Loyer appartement',
    amount: 1200,
    frequency: 'monthly',
    dueMonth: 1,
    paymentDay: 5,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const,
    categoryId: null,
    isActive: true,
    isWatched: false,
    notes: null,
  },
  {
    id: 'a2',
    label: 'Taxe voiture',
    amount: 300,
    frequency: 'annual',
    dueMonth: 6,
    paymentDay: 15,
    paymentMonths: [6] as const,
    categoryId: null,
    isActive: true,
    isWatched: false,
    notes: null,
  },
];

describe('<ChargesClient /> — PR-BETA-1 visual refactor', () => {
  beforeEach(() => {
    createChargeMock.mockReset();
    updateChargeMock.mockReset();
    deleteChargeMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    routerRefreshMock.mockReset();
    togglePaymentMock.mockReset();
  });

  it('shows the empty-state copy when no charges are provided', () => {
    renderCharges([]);
    // Stable hook via data-testid (i18n-agnostic) — copy can evolve without breaking the test.
    expect(screen.getByTestId('charges-empty-state')).toBeInTheDocument();
  });

  it('renders exactly one listitem per charge across the grouped sections (no row hidden, no parasite)', () => {
    renderCharges(sampleCharges);
    const list = screen.getByTestId('charges-list');
    // PR-UI-3a (THI-300): `charges-list` is now a <div> wrapper holding one
    // <section> per frequency group, each with its own <ul>. The load-bearing
    // invariant is that the only listitems are the charge rows — group headings
    // and the total footer must NOT introduce any — so the recursive count
    // through the nested <ul>s still equals the number of charges.
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(sampleCharges.length);
    // The total footer sits outside the list wrapper and carries no listitem.
    const total = screen.getByTestId('charges-total');
    expect(within(total).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('renders each cell with the value derived from the charge data (month + amount + label + chip)', () => {
    renderCharges(sampleCharges);

    // Row 1 — dueMonth: 1 (january) → "Janv." in fr-BE short, amount 1 200 €.
    const firstRow = screen.getByTestId('charges-row-a1');
    // PR-BETA-CLEANUP-2 (THI-281): `charges-row-month` was replaced by
    // `charges-row-next-due` (locale-aware date). See the dedicated next-due
    // assertions in the PR-BETA-CLEANUP-2 describe block below.
    expect(within(firstRow).getByTestId('charges-row-label')).toHaveTextContent(
      'Loyer appartement',
    );
    // THI-299: the badge now shows the locale abbreviation, with the full word
    // kept accessible via the `<abbr title>`.
    expect(within(firstRow).getByTestId('charges-row-frequency')).toHaveTextContent(/mens\./i);
    expect(within(firstRow).getByTitle('Mensuel')).toBeInTheDocument();
    // Tolerate regular space or non-breaking space inserted by Intl.NumberFormat.
    expect(within(firstRow).getByTestId('charges-row-amount')).toHaveTextContent(/1[  ]200/);

    // Row 2 — dueMonth: 6 (june) → "Juin" in fr-BE short, amount 300 €.
    // Locks the dueMonth → formatMonth wiring against silent regressions.
    const secondRow = screen.getByTestId('charges-row-a2');
    // PR-BETA-CLEANUP-2: next-due asserted below; month-only cell removed.
    expect(within(secondRow).getByTestId('charges-row-label')).toHaveTextContent('Taxe voiture');
    expect(within(secondRow).getByTestId('charges-row-frequency')).toHaveTextContent(/ann\./i);
    expect(within(secondRow).getByTitle('Annuel')).toBeInTheDocument();
    expect(within(secondRow).getByTestId('charges-row-amount')).toHaveTextContent(/300/);
  });

  it('exposes an aria-label naming the charge on every delete button', () => {
    renderCharges(sampleCharges);
    expect(screen.getByRole('button', { name: 'Supprimer Loyer appartement' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer Taxe voiture' })).toBeInTheDocument();
  });

  it('marks the amount cell with tabular-nums so digits align vertically across rows', () => {
    renderCharges(sampleCharges);
    const firstRow = screen.getByTestId('charges-row-a1');
    const amount = within(firstRow).getByTestId('charges-row-amount');
    expect(amount.className).toMatch(/tabular-nums/);
  });

  it('preserves the add-form CRUD scaffolding (out-of-scope guard against accidental refactor)', () => {
    renderCharges([]);
    // Coherence pass 2026-07: the form is collapsed by default (the list owns
    // the first screen) and opens through the header toggle.
    expect(screen.queryByLabelText('Libellé')).toBeNull();
    fireEvent.click(screen.getByTestId('charges-add-toggle'));
    // The 5 form fields + submit button stay reachable by their labels and roles.
    expect(screen.getByLabelText('Libellé')).toBeInTheDocument();
    expect(screen.getByLabelText(/Montant/)).toBeInTheDocument();
    expect(screen.getByLabelText('Fréquence')).toBeInTheDocument();
    // THI-301: the anchor-month select is intentionally HIDDEN for monthly
    // (the default) — the CadenceField summary line proves the cluster is
    // mounted AND narrates the default cadence (day 1, monthly).
    expect(screen.getByTestId('create-charge-summary')).toHaveTextContent(
      'Prélevé le 1 de chaque mois',
    );
    expect(screen.getByLabelText(/jour du mois/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ajouter$/i })).toBeInTheDocument();
  });
});

// PR-BETA-CLEANUP-2 (THI-281) — next-due cell, paymentDay input, edit drawer.
describe('<ChargesClient /> — PR-BETA-CLEANUP-2 list & form', () => {
  beforeEach(() => {
    createChargeMock.mockReset();
    updateChargeMock.mockReset();
    deleteChargeMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    routerRefreshMock.mockReset();
    togglePaymentMock.mockReset();
  });

  it('renders the next-due column with a locale-aware date for active charges', () => {
    renderCharges(sampleCharges);
    const cell = within(screen.getByTestId('charges-row-a1')).getByTestId('charges-row-next-due');
    // 4-digit year present (formatDate medium) — no longer just "JANV.".
    expect(cell.textContent ?? '').toMatch(/\d{4}/);
    expect(cell.textContent ?? '').not.toMatch(/^[a-zà-ÿ]{3,5}\.?$/i);
  });

  it('renders both Modifier and Supprimer buttons on each row', () => {
    renderCharges(sampleCharges);
    expect(screen.getByTestId('charges-row-edit-a1')).toBeInTheDocument();
    expect(screen.getByTestId('charges-row-delete-a1')).toBeInTheDocument();
    expect(screen.getByTestId('charges-row-edit-a2')).toBeInTheDocument();
    expect(screen.getByTestId('charges-row-delete-a2')).toBeInTheDocument();
  });

  it('passes paymentDay + computed paymentMonths to createChargeAction', async () => {
    createChargeMock.mockResolvedValue({ ok: true });
    renderCharges([]);
    fireEvent.click(screen.getByTestId('charges-add-toggle'));
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Assurance' } });
    fireEvent.change(screen.getByLabelText(/Montant/), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText(/jour du mois/i), { target: { value: '15' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /^ajouter$/i }).closest('form')!);
    });
    await waitFor(() => expect(createChargeMock).toHaveBeenCalledTimes(1));
    const payload = createChargeMock.mock.calls[0]?.[0];
    expect(payload.paymentDay).toBe(15);
    expect(payload.amount).toBe(120);
    expect(payload.label).toBe('Assurance');
    // Monthly default → all 12 months in the schedule.
    expect(payload.paymentMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('<ChargesClient /> — PR-BETA-CLEANUP-2 edit drawer', () => {
  beforeEach(() => {
    createChargeMock.mockReset();
    updateChargeMock.mockReset();
    deleteChargeMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    routerRefreshMock.mockReset();
    togglePaymentMock.mockReset();
  });

  it('opens the drawer when the Modifier button is clicked', async () => {
    renderCharges(sampleCharges);
    expect(screen.queryByTestId('charge-edit-drawer')).toBeNull();
    fireEvent.click(screen.getByTestId('charges-row-edit-a1'));
    expect(await screen.findByTestId('charge-edit-drawer')).toBeInTheDocument();
  });

  it('pre-fills the drawer fields with the row data', async () => {
    renderCharges(sampleCharges);
    fireEvent.click(screen.getByTestId('charges-row-edit-a1'));
    await screen.findByTestId('charge-edit-drawer');
    expect(screen.getByTestId('charge-edit-label')).toHaveValue('Loyer appartement');
    expect(screen.getByTestId('charge-edit-amount')).toHaveValue(1200);
    // THI-301: native <select> in CadenceField → string value.
    expect(screen.getByTestId('edit-charge-day')).toHaveValue('5');
  });

  it('pre-fills the cadence cluster for a NON-monthly charge (anchor month visible)', async () => {
    // a2 = Taxe voiture: annual, dueMonth 6, paymentDay 15.
    renderCharges(sampleCharges);
    fireEvent.click(screen.getByTestId('charges-row-edit-a2'));
    await screen.findByTestId('charge-edit-drawer');
    expect(screen.getByTestId('edit-charge-frequency')).toHaveValue('annual');
    expect(screen.getByTestId('edit-charge-month')).toHaveValue('6');
    expect(screen.getByTestId('edit-charge-day')).toHaveValue('15');
    expect(screen.getByTestId('edit-charge-summary')).toHaveTextContent(/juin/i);
  });

  it('calls updateChargeAction with the modified amount on Save', async () => {
    updateChargeMock.mockResolvedValue({ ok: true });
    renderCharges(sampleCharges);
    fireEvent.click(screen.getByTestId('charges-row-edit-a1'));
    await screen.findByTestId('charge-edit-drawer');
    fireEvent.change(screen.getByTestId('charge-edit-amount'), { target: { value: '1350' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('charge-edit-save'));
    });
    await waitFor(() => expect(updateChargeMock).toHaveBeenCalledTimes(1));
    expect(updateChargeMock.mock.calls[0]?.[0]).toBe('a1');
    expect(updateChargeMock.mock.calls[0]?.[1]).toMatchObject({ amount: 1350, paymentDay: 5 });
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the drawer open and shows an error toast on update failure', async () => {
    updateChargeMock.mockResolvedValue({ ok: false, errorCode: 'errors.charges.updateFailed' });
    renderCharges(sampleCharges);
    fireEvent.click(screen.getByTestId('charges-row-edit-a1'));
    await screen.findByTestId('charge-edit-drawer');
    await act(async () => {
      fireEvent.click(screen.getByTestId('charge-edit-save'));
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('charge-edit-drawer')).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});

// PR-UI-3a (THI-300) — frequency grouping, per-group subtotals, global total
// footer, mobile flatten.
describe('<ChargesClient /> — PR-UI-3a grouping & totals', () => {
  beforeEach(() => {
    createChargeMock.mockReset();
    updateChargeMock.mockReset();
    deleteChargeMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    routerRefreshMock.mockReset();
    togglePaymentMock.mockReset();
  });

  it('renders one section per non-empty frequency group, in fixed order, hiding empty groups', () => {
    renderCharges(sampleCharges);
    // sampleCharges = 1 monthly (a1) + 1 annual (a2): only those two groups exist.
    expect(screen.getByTestId('charges-group-monthly')).toBeInTheDocument();
    expect(screen.getByTestId('charges-group-annual')).toBeInTheDocument();
    expect(screen.queryByTestId('charges-group-quarterly')).toBeNull();
    expect(screen.queryByTestId('charges-group-semiannual')).toBeNull();

    // Fixed display order: monthly before annual, regardless of input order.
    const list = screen.getByTestId('charges-list');
    const sectionIds = Array.from(
      list.querySelectorAll<HTMLElement>('section[data-testid^="charges-group-"]'),
    ).map((el) => el.getAttribute('data-testid'));
    expect(sectionIds).toEqual(['charges-group-monthly', 'charges-group-annual']);
  });

  it('places each charge row inside its frequency group', () => {
    renderCharges(sampleCharges);
    const monthly = screen.getByTestId('charges-group-monthly');
    const annual = screen.getByTestId('charges-group-annual');
    expect(within(monthly).getByTestId('charges-row-a1')).toBeInTheDocument();
    expect(within(monthly).queryByTestId('charges-row-a2')).toBeNull();
    expect(within(annual).getByTestId('charges-row-a2')).toBeInTheDocument();
  });

  it('shows the server-computed subtotal next to each group heading', () => {
    renderCharges(sampleCharges, {
      subtotals: { monthly: 1200, quarterly: 0, semiannual: 0, annual: 300 },
    });
    const monthlySub = screen.getByTestId('charges-group-subtotal-monthly');
    expect(monthlySub).toHaveTextContent(/Sous-total/);
    expect(monthlySub).toHaveTextContent(/1[  ]200/);
    expect(screen.getByTestId('charges-group-subtotal-annual')).toHaveTextContent(/300/);
  });

  it('renders the global total footer with the smoothed monthly and annual figures', () => {
    renderCharges(sampleCharges, { monthlyProvisionTotal: 1225, annualTotal: 14700 });
    const total = screen.getByTestId('charges-total');
    expect(total).toHaveTextContent('Effort lissé / mois');
    expect(total).toHaveTextContent('Équivalent annuel');
    expect(screen.getByTestId('charges-total-monthly')).toHaveTextContent(/1[  ]225/);
    expect(screen.getByTestId('charges-total-annual')).toHaveTextContent(/14[  ]700/);
  });

  it('does not render the total footer when there are no charges', () => {
    renderCharges([]);
    expect(screen.queryByTestId('charges-total')).toBeNull();
    expect(screen.queryByTestId('charges-list')).toBeNull();
  });

  it('flattens rows (no card chrome) so mobile shows plain divided lines, not fragmented cards', () => {
    renderCharges(sampleCharges);
    const firstRow = screen.getByTestId('charges-row-a1');
    // Card chrome removed: the row is a flat list line separated by the group
    // <ul>'s divide-y, not a bordered/rounded/filled card.
    expect(firstRow.className).not.toMatch(/rounded-lg/);
    expect(firstRow.className).not.toMatch(/bg-card/);
    expect(firstRow.className).not.toMatch(/\bp-4\b/);
    // The parent group list carries the divider.
    expect(firstRow.closest('ul')?.className).toMatch(/divide-y/);
  });
});

describe('Factures Phase 2 — Payé toggle', () => {
  const monthlyCharge = sampleCharges[0]!; // paymentMonths 1..12 → due every month

  it('hides the toggle for a charge not due in the current period', () => {
    const annualJune = {
      ...monthlyCharge,
      id: 'an1',
      frequency: 'annual',
      paymentMonths: [6] as readonly number[],
    };
    renderCharges([annualJune], { currentPeriod: { year: 2026, month: 1 } });
    expect(screen.queryByTestId('charges-row-paid-an1')).not.toBeInTheDocument();
  });

  it('reflects the seeded paid state via aria-pressed', () => {
    renderCharges([monthlyCharge], {
      paidChargeIds: [monthlyCharge.id],
      currentPeriod: { year: 2026, month: 1 },
    });
    expect(screen.getByTestId(`charges-row-paid-${monthlyCharge.id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('toggles paid optimistically and calls the action with the current period', async () => {
    togglePaymentMock.mockResolvedValue({ ok: true, data: { paid: true, paidAmount: 1200 } });
    renderCharges([monthlyCharge], { currentPeriod: { year: 2026, month: 3 } });
    const toggle = screen.getByTestId(`charges-row-paid-${monthlyCharge.id}`);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {
      fireEvent.click(toggle);
    });
    await waitFor(() =>
      expect(togglePaymentMock).toHaveBeenCalledWith({
        chargeId: monthlyCharge.id,
        periodYear: 2026,
        periodMonth: 3,
      }),
    );
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it('shows an error toast when the toggle fails', async () => {
    togglePaymentMock.mockResolvedValue({
      ok: false,
      errorCode: 'errors.charges.payments.toggleFailed',
    });
    renderCharges([monthlyCharge], { currentPeriod: { year: 2026, month: 1 } });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`charges-row-paid-${monthlyCharge.id}`));
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it('renders the "ce mois" paid summary when charges are due', () => {
    renderCharges([monthlyCharge], { currentPeriod: { year: 2026, month: 1 } });
    expect(screen.getByTestId('charges-paid-summary')).toBeInTheDocument();
  });

  it('shows the remaining amount headline: full when unpaid, zero once seeded paid', () => {
    // Unpaid: remaining = the bill's full amount (1 200 €).
    const { unmount } = renderCharges([monthlyCharge], {
      currentPeriod: { year: 2026, month: 1 },
    });
    expect(screen.getByTestId('charges-remaining-amount')).toHaveTextContent(/1[  ]200/);
    unmount();
    // Seeded paid: the countdown reflects it — remaining drops to 0, count 1/1.
    renderCharges([monthlyCharge], {
      currentPeriod: { year: 2026, month: 1 },
      paidChargeIds: [monthlyCharge.id],
    });
    expect(screen.getByTestId('charges-remaining-amount')).toHaveTextContent(/^0/);
    expect(screen.getByTestId('charges-paid-summary')).toHaveTextContent('1/1');
  });

  it('shows a live per-group remaining next to the subtotal, replaced by "tout payé" once settled', () => {
    // Unpaid due-this-month bill → the group line shows "reste 1 200 €".
    const { unmount } = renderCharges([monthlyCharge], {
      currentPeriod: { year: 2026, month: 1 },
    });
    expect(screen.getByTestId('charges-group-remaining-monthly')).toHaveTextContent(/1[  ]200/);
    expect(screen.queryByTestId('charges-group-allpaid-monthly')).toBeNull();
    unmount();
    // Seeded paid → the countdown never silently disappears: it flips to a
    // persistent "tout payé" state so the static subtotal cannot be misread
    // as an amount still owed.
    renderCharges([monthlyCharge], {
      currentPeriod: { year: 2026, month: 1 },
      paidChargeIds: [monthlyCharge.id],
    });
    expect(screen.queryByTestId('charges-group-remaining-monthly')).toBeNull();
    expect(screen.getByTestId('charges-group-allpaid-monthly')).toHaveTextContent(/tout payé/i);
  });

  it('flips the banner to the all-paid success state and hides the hint', () => {
    const { unmount } = renderCharges([monthlyCharge], {
      currentPeriod: { year: 2026, month: 1 },
    });
    expect(screen.getByTestId('charges-paid-summary')).toHaveTextContent('Reste à payer ce mois');
    expect(screen.getByTestId('charges-paid-hint')).toBeInTheDocument();
    unmount();
    renderCharges([monthlyCharge], {
      currentPeriod: { year: 2026, month: 1 },
      paidChargeIds: [monthlyCharge.id],
    });
    expect(screen.getByTestId('charges-paid-summary')).toHaveTextContent('Tout est payé ce mois');
    expect(screen.queryByTestId('charges-paid-hint')).toBeNull();
  });

  it('sorts rows by resolved due date ascending within a group (stable under ticking)', () => {
    const late = { ...monthlyCharge, id: 'late', label: 'Late bill', paymentDay: 20 };
    const early = { ...monthlyCharge, id: 'early', label: 'Early bill', paymentDay: 3 };
    renderCharges([late, early], { currentPeriod: { year: 2026, month: 1 } });
    const ids = within(screen.getByTestId('charges-group-monthly'))
      .getAllByRole('listitem')
      .map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['charges-row-early', 'charges-row-late']);
  });

  it('labels every cadence unit and shows the due-this-month count in the title', () => {
    const quarterly = {
      ...sampleCharges[0]!,
      id: 'q1',
      frequency: 'quarterly',
      paymentMonths: [1, 4, 7, 10] as readonly number[],
    };
    const semiannual = {
      ...sampleCharges[0]!,
      id: 's1',
      frequency: 'semiannual',
      paymentMonths: [1, 7] as readonly number[],
    };
    renderCharges([...sampleCharges, quarterly, semiannual], {
      subtotals: { monthly: 1200, quarterly: 100, semiannual: 200, annual: 300 },
      currentPeriod: { year: 2026, month: 1 },
    });
    expect(screen.getByTestId('charges-group-subtotal-monthly')).toHaveTextContent('/mois');
    expect(screen.getByTestId('charges-group-subtotal-quarterly')).toHaveTextContent('/trimestre');
    expect(screen.getByTestId('charges-group-subtotal-semiannual')).toHaveTextContent('/semestre');
    expect(screen.getByTestId('charges-group-subtotal-annual')).toHaveTextContent('/an');
    // Due in January: monthly a1 + quarterly q1 + semiannual s1 (annual a2 is June).
    expect(screen.getByText(/3 dues ce mois/)).toBeInTheDocument();
  });

  it('collapses the add form after a successful creation', async () => {
    createChargeMock.mockResolvedValue({ ok: true });
    renderCharges([]);
    fireEvent.click(screen.getByTestId('charges-add-toggle'));
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Assurance' } });
    fireEvent.change(screen.getByLabelText(/Montant/), { target: { value: '10' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /^ajouter$/i }).closest('form')!);
    });
    await waitFor(() => expect(screen.queryByLabelText('Libellé')).toBeNull());
  });

  it('reflects the collapsed/expanded state on the add toggle via aria-expanded', () => {
    renderCharges([]);
    const toggle = screen.getByTestId('charges-add-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('seeds the watch button state from isWatched, flips optimistically, and calls toggleWatchAction', async () => {
    // Deferred action: the optimistic flip is only observable while the
    // server call is PENDING (React 19 reconciles useOptimistic back to the
    // base once the transition settles in the test harness).
    let resolveAction!: (v: { ok: true; data: { watched: boolean } }) => void;
    toggleWatchMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveAction = res;
        }),
    );
    renderCharges([monthlyCharge], { currentPeriod: { year: 2026, month: 1 } });
    const watchBtn = screen.getByTestId(`charges-row-watch-${monthlyCharge.id}`);
    expect(watchBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(watchBtn);
    // Optimistic state visible before the server responds.
    await waitFor(() => expect(watchBtn).toHaveAttribute('aria-pressed', 'true'));
    expect(toggleWatchMock).toHaveBeenCalledWith(monthlyCharge.id);
    await act(async () => {
      resolveAction({ ok: true, data: { watched: true } });
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it('shows the watchFailed toast when toggleWatchAction throws (catch path)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    toggleWatchMock.mockRejectedValueOnce(new Error('network error'));
    renderCharges([monthlyCharge], { currentPeriod: { year: 2026, month: 1 } });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`charges-row-watch-${monthlyCharge.id}`));
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    consoleSpy.mockRestore();
  });

  it('renders a pressed watch button for a charge already flagged', () => {
    renderCharges([{ ...monthlyCharge, isWatched: true }], {
      currentPeriod: { year: 2026, month: 1 },
    });
    expect(screen.getByTestId(`charges-row-watch-${monthlyCharge.id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows an error toast when the watch toggle fails', async () => {
    toggleWatchMock.mockResolvedValue({ ok: false, errorCode: 'errors.charges.watchFailed' });
    renderCharges([monthlyCharge], { currentPeriod: { year: 2026, month: 1 } });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`charges-row-watch-${monthlyCharge.id}`));
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it('keeps the sort order stable when a bill is ticked (no reorder under the finger)', async () => {
    togglePaymentMock.mockResolvedValue({ ok: true, data: { paid: true, paidAmount: 1200 } });
    const late = { ...monthlyCharge, id: 'late', label: 'Late bill', paymentDay: 20 };
    const early = { ...monthlyCharge, id: 'early', label: 'Early bill', paymentDay: 3 };
    renderCharges([late, early], { currentPeriod: { year: 2026, month: 1 } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('charges-row-paid-early'));
    });
    const ids = within(screen.getByTestId('charges-group-monthly'))
      .getAllByRole('listitem')
      .map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['charges-row-early', 'charges-row-late']);
  });

  it('renders the paid-toggle hint when charges are due this month', () => {
    renderCharges([monthlyCharge], { currentPeriod: { year: 2026, month: 1 } });
    expect(screen.getByTestId('charges-paid-hint')).toBeInTheDocument();
  });
});

// THI-329 — current-period due date + overdue badge (PR-B). The component reads
// the real clock for `todayIso`, so to keep "overdue" deterministic without
// faking timers we drive it through `currentPeriod`: a PAST period is always
// before today (→ overdue), a far-FUTURE period is always after (→ not overdue).
describe('<ChargesClient /> — THI-329 current-period date & overdue badge', () => {
  const monthly = sampleCharges[0]!; // paymentDay 5, due every month

  beforeEach(() => {
    createChargeMock.mockReset();
    updateChargeMock.mockReset();
    deleteChargeMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    routerRefreshMock.mockReset();
    togglePaymentMock.mockReset();
  });

  it('flags an unpaid current-month charge whose day has passed as overdue, anchored to that month (not the next)', () => {
    renderCharges([monthly], { currentPeriod: { year: 2020, month: 6 } });
    const row = screen.getByTestId('charges-row-a1');
    expect(within(row).getByTestId('charges-row-overdue-a1')).toBeInTheDocument();
    const due = within(row).getByTestId('charges-row-next-due').textContent ?? '';
    // Date stays on the current month (June 2020) — does NOT roll to July.
    expect(due).toMatch(/2020/);
    expect(due).toMatch(/juin/i);
    expect(due).not.toMatch(/juillet/i);
  });

  it('shows no overdue badge when the current-month due day is still ahead', () => {
    renderCharges([monthly], { currentPeriod: { year: 2099, month: 6 } });
    expect(screen.queryByTestId('charges-row-overdue-a1')).toBeNull();
  });

  it('shows no overdue badge for a charge not due in the current month (upcoming)', () => {
    // annual a2 [6]; current month March → upcoming June, never overdue.
    renderCharges([sampleCharges[1]!], { currentPeriod: { year: 2020, month: 3 } });
    expect(screen.queryByTestId('charges-row-overdue-a2')).toBeNull();
  });

  it('shows no overdue badge for a paid current-month charge (paid beats overdue)', () => {
    // Same past period that makes the unpaid row overdue above, but seeded paid:
    // the badge must be gone (status 'paid' wins). Seeding via paidChargeIds (not
    // the optimistic toggle) keeps this deterministic — useOptimistic reverts to
    // its base after the transition settles in the test harness.
    renderCharges([monthly], { currentPeriod: { year: 2020, month: 6 }, paidChargeIds: ['a1'] });
    expect(screen.queryByTestId('charges-row-overdue-a1')).toBeNull();
    expect(screen.getByTestId('charges-row-paid-a1')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('app.charges — i18n parity (5 locales, PR-BETA-CLEANUP-2)', () => {
  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s exposes paymentDay + edit + drawer + total keys',
    async (locale) => {
      const m = (await import(`../../../../../../messages/${locale}.json`)).default as {
        app: {
          charges: {
            paymentDayLabel?: string;
            paymentDayHint?: string;
            editAria?: string;
            toastUpdated?: string;
            subtotalLabel?: string;
            totalMonthlyLabel?: string;
            totalAnnualLabel?: string;
            toastMarkedPaid?: string;
            toastMarkedUnpaid?: string;
            markPaidAria?: string;
            unmarkPaidAria?: string;
            paidSummary?: string;
            paidHint?: string;
            statusOverdue?: string;
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
      const c = m.app.charges;
      expect(c.paymentDayLabel).toBeTypeOf('string');
      expect((c.paymentDayLabel ?? '').length).toBeGreaterThan(0);
      expect(c.paymentDayHint).toBeTypeOf('string');
      expect(c.editAria).toBeTypeOf('string');
      expect((c.editAria ?? '').includes('{label}')).toBe(true);
      expect(c.toastUpdated).toBeTypeOf('string');
      // PR-UI-3a (THI-300) — total recap labels.
      expect((c.subtotalLabel ?? '').length).toBeGreaterThan(0);
      expect((c.totalMonthlyLabel ?? '').length).toBeGreaterThan(0);
      expect((c.totalAnnualLabel ?? '').length).toBeGreaterThan(0);
      expect(c.drawer?.title).toBeTypeOf('string');
      expect(c.drawer?.save).toBeTypeOf('string');
      expect(c.drawer?.saving).toBeTypeOf('string');
      expect(c.drawer?.cancel).toBeTypeOf('string');
      expect(c.drawer?.errorGeneric).toBeTypeOf('string');
      // Factures Phase 2 (Payé toggle) — keys present + placeholder integrity.
      expect((c.toastMarkedPaid ?? '').length).toBeGreaterThan(0);
      expect((c.toastMarkedUnpaid ?? '').length).toBeGreaterThan(0);
      expect((c.markPaidAria ?? '').includes('{label}')).toBe(true);
      expect((c.unmarkPaidAria ?? '').includes('{label}')).toBe(true);
      expect((c.paidSummary ?? '').includes('{paid}')).toBe(true);
      expect((c.paidSummary ?? '').includes('{total}')).toBe(true);
      expect((c.paidSummary ?? '').includes('{remaining}')).toBe(true);
      expect((c.paidHint ?? '').length).toBeGreaterThan(0);
      // THI-329 (PR-B) — overdue status badge.
      expect((c.statusOverdue ?? '').length).toBeGreaterThan(0);
      // THI-329 (PR-C) — watch marker keys.
      const cw = c as typeof c & {
        watchAria?: string;
        unwatchAria?: string;
        toastWatched?: string;
        toastUnwatched?: string;
      };
      expect((cw.watchAria ?? '').includes('{label}')).toBe(true);
      expect((cw.unwatchAria ?? '').includes('{label}')).toBe(true);
      expect((cw.toastWatched ?? '').length).toBeGreaterThan(0);
      expect((cw.toastUnwatched ?? '').length).toBeGreaterThan(0);
    },
  );
});
