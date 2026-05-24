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
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const createChargeMock = vi.hoisted(() => vi.fn());
const deleteChargeMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/charges', () => ({
  createChargeAction: createChargeMock,
  deleteChargeAction: deleteChargeMock,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
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
    categoryId: null,
    isActive: true,
    notes: null,
  },
];

describe('<ChargesClient /> — PR-BETA-1 visual refactor', () => {
  beforeEach(() => {
    createChargeMock.mockReset();
    deleteChargeMock.mockReset();
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
    expect(within(firstRow).getByTestId('charges-row-month')).toHaveTextContent(/^janv\.?$/i);
    expect(within(firstRow).getByTestId('charges-row-label')).toHaveTextContent(
      'Loyer appartement',
    );
    expect(within(firstRow).getByTestId('charges-row-frequency')).toHaveTextContent(/mensuel/i);
    // Tolerate regular space or non-breaking space inserted by Intl.NumberFormat.
    expect(within(firstRow).getByTestId('charges-row-amount')).toHaveTextContent(/1[  ]200/);

    // Row 2 — dueMonth: 6 (june) → "Juin" in fr-BE short, amount 300 €.
    // Locks the dueMonth → formatMonth wiring against silent regressions.
    const secondRow = screen.getByTestId('charges-row-a2');
    expect(within(secondRow).getByTestId('charges-row-month')).toHaveTextContent(/^juin$/i);
    expect(within(secondRow).getByTestId('charges-row-label')).toHaveTextContent('Taxe voiture');
    expect(within(secondRow).getByTestId('charges-row-frequency')).toHaveTextContent(/annuel/i);
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
    // The 4 form fields + submit button stay reachable by their labels and roles.
    expect(screen.getByLabelText('Libellé')).toBeInTheDocument();
    expect(screen.getByLabelText(/Montant/)).toBeInTheDocument();
    expect(screen.getByLabelText('Fréquence')).toBeInTheDocument();
    expect(screen.getByLabelText('Mois de référence')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ajouter$/i })).toBeInTheDocument();
  });
});
