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

vi.mock('@/lib/actions/charges', () => ({
  createChargeAction: createChargeMock,
  updateChargeAction: updateChargeMock,
  deleteChargeAction: deleteChargeMock,
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
  });

  it('shows the empty-state copy when no charges are provided', () => {
    renderWithIntl(<ChargesClient charges={[]} />);
    // Stable hook via data-testid (i18n-agnostic) — copy can evolve without breaking the test.
    expect(screen.getByTestId('charges-empty-state')).toBeInTheDocument();
  });

  it('renders the charges list as a semantic <ul role="list"> with one <li> per charge', () => {
    renderWithIntl(<ChargesClient charges={sampleCharges} />);
    const list = screen.getByTestId('charges-list');
    expect(list.tagName).toBe('UL');
    expect(list).toHaveAttribute('role', 'list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(sampleCharges.length);
  });

  it('renders each cell with the value derived from the charge data (month + amount + label + chip)', () => {
    renderWithIntl(<ChargesClient charges={sampleCharges} />);

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
    renderWithIntl(<ChargesClient charges={sampleCharges} />);
    expect(screen.getByRole('button', { name: 'Supprimer Loyer appartement' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer Taxe voiture' })).toBeInTheDocument();
  });

  it('marks the amount cell with tabular-nums so digits align vertically across rows', () => {
    renderWithIntl(<ChargesClient charges={sampleCharges} />);
    const firstRow = screen.getByTestId('charges-row-a1');
    const amount = within(firstRow).getByTestId('charges-row-amount');
    expect(amount.className).toMatch(/tabular-nums/);
  });

  it('preserves the add-form CRUD scaffolding (out-of-scope guard against accidental refactor)', () => {
    renderWithIntl(<ChargesClient charges={[]} />);
    // The 5 form fields + submit button stay reachable by their labels and roles.
    expect(screen.getByLabelText('Libellé')).toBeInTheDocument();
    expect(screen.getByLabelText(/Montant/)).toBeInTheDocument();
    expect(screen.getByLabelText('Fréquence')).toBeInTheDocument();
    expect(screen.getByLabelText('Mois de référence')).toBeInTheDocument();
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
  });

  it('renders the next-due column with a locale-aware date for active charges', () => {
    renderWithIntl(<ChargesClient charges={sampleCharges} />);
    const cell = within(screen.getByTestId('charges-row-a1')).getByTestId('charges-row-next-due');
    // 4-digit year present (formatDate medium) — no longer just "JANV.".
    expect(cell.textContent ?? '').toMatch(/\d{4}/);
    expect(cell.textContent ?? '').not.toMatch(/^[a-zà-ÿ]{3,5}\.?$/i);
  });

  it('renders both Modifier and Supprimer buttons on each row', () => {
    renderWithIntl(<ChargesClient charges={sampleCharges} />);
    expect(screen.getByTestId('charges-row-edit-a1')).toBeInTheDocument();
    expect(screen.getByTestId('charges-row-delete-a1')).toBeInTheDocument();
    expect(screen.getByTestId('charges-row-edit-a2')).toBeInTheDocument();
    expect(screen.getByTestId('charges-row-delete-a2')).toBeInTheDocument();
  });

  it('passes paymentDay + computed paymentMonths to createChargeAction', async () => {
    createChargeMock.mockResolvedValue({ ok: true });
    renderWithIntl(<ChargesClient charges={[]} />);
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
  });

  it('opens the drawer when the Modifier button is clicked', async () => {
    renderWithIntl(<ChargesClient charges={sampleCharges} />);
    expect(screen.queryByTestId('charge-edit-drawer')).toBeNull();
    fireEvent.click(screen.getByTestId('charges-row-edit-a1'));
    expect(await screen.findByTestId('charge-edit-drawer')).toBeInTheDocument();
  });

  it('pre-fills the drawer fields with the row data', async () => {
    renderWithIntl(<ChargesClient charges={sampleCharges} />);
    fireEvent.click(screen.getByTestId('charges-row-edit-a1'));
    await screen.findByTestId('charge-edit-drawer');
    expect(screen.getByTestId('charge-edit-label')).toHaveValue('Loyer appartement');
    expect(screen.getByTestId('charge-edit-amount')).toHaveValue(1200);
    expect(screen.getByTestId('charge-edit-payment-day')).toHaveValue(5);
  });

  it('calls updateChargeAction with the modified amount on Save', async () => {
    updateChargeMock.mockResolvedValue({ ok: true });
    renderWithIntl(<ChargesClient charges={sampleCharges} />);
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
    renderWithIntl(<ChargesClient charges={sampleCharges} />);
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

describe('app.charges — i18n parity (5 locales, PR-BETA-CLEANUP-2)', () => {
  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s exposes paymentDay + edit + drawer keys',
    async (locale) => {
      const m = (await import(`../../../../../../messages/${locale}.json`)).default as {
        app: {
          charges: {
            paymentDayLabel?: string;
            paymentDayHint?: string;
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
      const c = m.app.charges;
      expect(c.paymentDayLabel).toBeTypeOf('string');
      expect((c.paymentDayLabel ?? '').length).toBeGreaterThan(0);
      expect(c.paymentDayHint).toBeTypeOf('string');
      expect(c.editAria).toBeTypeOf('string');
      expect((c.editAria ?? '').includes('{label}')).toBe(true);
      expect(c.toastUpdated).toBeTypeOf('string');
      expect(c.drawer?.title).toBeTypeOf('string');
      expect(c.drawer?.save).toBeTypeOf('string');
      expect(c.drawer?.saving).toBeTypeOf('string');
      expect(c.drawer?.cancel).toBeTypeOf('string');
      expect(c.drawer?.errorGeneric).toBeTypeOf('string');
    },
  );
});
