/**
 * ChargesClient — the SHAPE of the v3 mockup (E1 bis).
 *
 * Structural contract only: one action per row, the edit/delete/watch gestures
 * living in the drawer (built on the shared `Sheet` primitive), the head answer
 * card, the per-cadence disclosure and the « counted each month » footer whose
 * smoothed share names every bill it comes from (DESIGN-v3 rule 28).
 * No arithmetic is asserted here that the domain does not already own.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const deleteChargeMock = vi.hoisted(() => vi.fn());
const toggleWatchMock = vi.hoisted(() => vi.fn());
const togglePaymentMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/charges', () => ({
  createChargeAction: vi.fn(),
  updateChargeAction: vi.fn(),
  deleteChargeAction: deleteChargeMock,
  toggleWatchAction: toggleWatchMock,
}));
vi.mock('@/lib/actions/charge-payments', () => ({ togglePaymentAction: togglePaymentMock }));
vi.mock('@/lib/actions/commitments', () => ({ toggleCommitmentPaymentAction: vi.fn() }));
vi.mock('@/lib/actions/obligations', () => ({ togglePastDueObligationsAction: vi.fn() }));
vi.mock('@/lib/actions/charge-conversion', () => ({ convertChargeToCommitmentAction: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : href.pathname} {...rest}>
      {children}
    </a>
  ),
}));

import { ChargesClient } from '../ChargesClient';

type Props = React.ComponentProps<typeof ChargesClient>;

const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const rent = {
  id: 'rent',
  label: 'Loyer',
  amount: 505,
  frequency: 'monthly',
  dueMonth: 1,
  paymentDay: 5,
  paymentMonths: all,
  categoryId: null,
  isActive: true,
  isWatched: false,
  notes: null,
};
const water = {
  id: 'water',
  label: 'Eau',
  amount: 45,
  frequency: 'quarterly',
  dueMonth: 1,
  paymentDay: 10,
  paymentMonths: [1, 4, 7, 10] as const,
  categoryId: null,
  isActive: true,
  isWatched: false,
  notes: null,
};

function renderCharges(charges: Props['charges'], overrides: Partial<Props> = {}) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <ChargesClient
        charges={charges}
        paidChargeIds={overrides.paidChargeIds ?? []}
        commitmentInstalments={overrides.commitmentInstalments ?? []}
        aPayerCeMoisTotal={overrides.aPayerCeMoisTotal ?? 550.4}
        effortLisseTotal={overrides.effortLisseTotal ?? 520}
        effortLisseAnnuelTotal={overrides.effortLisseAnnuelTotal ?? 6240}
        lissage={
          overrides.lissage ?? {
            total: 15,
            parts: [{ id: 'water', label: 'Eau', monthly: 15, invoiceAmount: 45, cycleMonths: 3 }],
          }
        }
        duplicates={[]}
        bulk={overrides.bulk ?? { gesture: 'rien', pastDueCount: 0 }}
        viewedPeriod={{ year: 2026, month: 2 }}
        periodNav={{
          label: 'février 2026',
          prevParam: null,
          nextParam: null,
          isCurrent: true,
          currentLabel: 'février 2026',
        }}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  deleteChargeMock.mockReset();
  toggleWatchMock.mockReset();
  togglePaymentMock.mockReset();
});

describe('ChargesClient — v3 shape (F11: one action per row)', () => {
  it('a row carries ONE action (the tick) plus the opener — no pencil, bin or bookmark', () => {
    renderCharges([rent]);
    const row = screen.getByTestId('charges-row-rent');
    const buttons = within(row).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('data-testid'))).toEqual([
      'charges-row-paid-rent',
      'charges-row-open-rent',
    ]);
    expect(screen.queryByTestId('charges-row-edit-rent')).toBeNull();
    expect(screen.queryByTestId('charges-row-delete-rent')).toBeNull();
    expect(screen.queryByTestId('charges-row-watch-rent')).toBeNull();
  });

  it('the opener reads the description first, and opens the drawer', async () => {
    renderCharges([rent]);
    const opener = screen.getByTestId('charges-row-open-rent');
    expect(opener.textContent?.indexOf('Loyer')).toBe(0);
    fireEvent.click(opener);
    expect(await screen.findByTestId('charge-edit-drawer')).toBeInTheDocument();
  });
});

describe('ChargesClient — v3 shape (F15: the drawer is a Sheet and owns the gestures)', () => {
  it('is rendered by the shared Sheet primitive (dialog + backdrop)', async () => {
    renderCharges([rent]);
    fireEvent.click(screen.getByTestId('charges-row-open-rent'));
    const drawer = await screen.findByTestId('charge-edit-drawer');
    expect(drawer).toHaveAttribute('role', 'dialog');
    expect(screen.getByTestId('charge-edit-drawer-backdrop')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Convertir en engagement/ })).toBeVisible();
  });

  it('delete asks for a confirmation before calling the action', async () => {
    deleteChargeMock.mockResolvedValue({ ok: true, data: null });
    renderCharges([rent]);
    fireEvent.click(screen.getByTestId('charges-row-open-rent'));
    await screen.findByTestId('charge-edit-drawer');
    fireEvent.click(screen.getByTestId('charge-drawer-delete'));
    expect(deleteChargeMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByTestId('charge-drawer-delete-confirm'));
    });
    await waitFor(() => expect(deleteChargeMock).toHaveBeenCalledWith('rent'));
  });

  it('a delete confirmation left pending does not survive closing the drawer', async () => {
    renderCharges([rent]);
    fireEvent.click(screen.getByTestId('charges-row-open-rent'));
    fireEvent.click(await screen.findByTestId('charge-drawer-delete'));
    expect(screen.getByTestId('charge-drawer-delete-confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('charge-edit-cancel'));
    await waitFor(() => expect(screen.queryByTestId('charge-edit-drawer')).toBeNull());
    fireEvent.click(screen.getByTestId('charges-row-open-rent'));
    await screen.findByTestId('charge-edit-drawer');
    expect(screen.queryByTestId('charge-drawer-delete-confirm')).toBeNull();
    expect(screen.getByTestId('charge-drawer-delete')).toBeInTheDocument();
  });

  it('the « À surveiller » gesture lives in the drawer, with its pressed state', async () => {
    toggleWatchMock.mockResolvedValue({ ok: true, data: { watched: false } });
    renderCharges([{ ...rent, isWatched: true }]);
    fireEvent.click(screen.getByTestId('charges-row-open-rent'));
    const watch = await screen.findByTestId('charge-drawer-watch');
    expect(watch).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      fireEvent.click(watch);
    });
    expect(toggleWatchMock).toHaveBeenCalledWith('rent');
  });
});

describe('ChargesClient — v3 shape (F10: one disclosure per cadence)', () => {
  it('« Mensuel » opens by default, the other cadences start folded', () => {
    renderCharges([rent, water]);
    const monthly = screen.getByTestId('charges-group-toggle-monthly');
    const quarterly = screen.getByTestId('charges-group-toggle-quarterly');
    expect(monthly).toHaveAttribute('aria-expanded', 'true');
    expect(quarterly).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('charges-row-rent')).toBeVisible();
    expect(screen.queryByTestId('charges-row-water')).toBeNull();
    fireEvent.click(quarterly);
    expect(quarterly).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('charges-row-water')).toBeInTheDocument();
  });

  it('a folded cadence still says what it holds: « 1, rien ce mois »', () => {
    renderCharges([rent, water]);
    expect(screen.getByTestId('charges-group-toggle-quarterly')).toHaveTextContent(
      /Trimestriel.*1, rien ce mois/,
    );
    expect(screen.getByTestId('charges-group-toggle-monthly')).toHaveTextContent(
      /Mensuel.*1 à payer sur 1/,
    );
  });
});

describe('ChargesClient — v3 shape (F8 head card, F6/F14 footer)', () => {
  it('the head card answers « Encore à payer » with X/Y payées and « À payer ce mois »', () => {
    renderCharges([rent]);
    const card = screen.getByTestId('charges-head-card');
    expect(card).toHaveTextContent('Encore à payer');
    expect(card).toHaveTextContent('0/1 payées');
    expect(within(card).getByTestId('charges-a-payer-total')).toHaveTextContent(/550,40/);
  });

  it('the footer names the smoothed share bill by bill, and the total with its year', () => {
    renderCharges([rent, water]);
    fireEvent.click(screen.getByTestId('charges-total-toggle'));
    const total = screen.getByTestId('charges-total');
    expect(total).toHaveTextContent('Compté chaque mois pour tes factures');
    expect(screen.getByTestId('charges-effort-lisse-total')).toHaveTextContent(/15\s€/);
    const part = screen.getByTestId('charges-lissage-part-water');
    expect(part).toHaveTextContent(/Eau · 45\s€ tous les 3 mois/);
    expect(part).toHaveTextContent(/15\s€ par mois/);
    expect(screen.getByTestId('charges-total-monthly')).toHaveTextContent(/520\s€/);
    expect(screen.getByTestId('charges-total-annual')).toHaveTextContent(/6[\u00a0\u202f ]240\s€/);
    expect(total.textContent ?? '').not.toMatch(/retenu/i);
  });
});
