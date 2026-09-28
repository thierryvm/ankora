/**
 * « Modifier la facture » — the amount field.
 *
 * Incident: the field was `type="number"`. A comma-typed « 5,90 » is blanked
 * by the browser, the drawer read `Number('')`, i.e. 0, and the bill was saved
 * at 0 € without a word. The field is now text with a decimal keypad, read by
 * the shared `parseAmountInput`, and « Enregistrer » waits for an amount it
 * can read — saying why under the field.
 *
 * Typed key by key (`userEvent.type`), as a person does: `fireEvent.change`
 * would hand the whole string over at once and skip the per-keystroke
 * sanitising that caused the incident. Figures are fictitious.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const updateChargeMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/charges', () => ({
  updateChargeAction: updateChargeMock,
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: toastErrorMock },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { ChargeEditDrawer, type ChargeEditDrawerCharge } from '../ChargeEditDrawer';

const INVALID_AMOUNT = 'Écris un montant supérieur à 0, avec une virgule ou un point.';

const CHARGE: ChargeEditDrawerCharge = {
  id: '3f6c1a52-8e1b-4c3d-9a7e-2b5d6f8a9c01',
  label: 'Assurance habitation',
  amount: 505,
  frequency: 'monthly',
  dueMonth: 1,
  paymentDay: 5,
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

function renderDrawer() {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <ChargeEditDrawer charge={CHARGE} onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

async function typeAmount(value: string) {
  const user = userEvent.setup();
  const field = screen.getByTestId('charge-edit-amount');
  await user.clear(field);
  if (value !== '') await user.type(field, value);
  return { user, field };
}

describe('ChargeEditDrawer — the amount a francophone types', () => {
  beforeEach(() => {
    updateChargeMock.mockReset();
    updateChargeMock.mockResolvedValue({ ok: true });
    toastErrorMock.mockReset();
  });

  it('is a text field with a decimal keypad, not a numeric field', () => {
    renderDrawer();
    const field = screen.getByTestId('charge-edit-amount');
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveAttribute('inputmode', 'decimal');
    expect(field).toHaveAttribute('autocomplete', 'off');
  });

  it('sends 5.9 when « 5,90 » is typed', async () => {
    renderDrawer();
    const { user } = await typeAmount('5,90');
    await user.click(screen.getByTestId('charge-edit-save'));
    await waitFor(() => expect(updateChargeMock).toHaveBeenCalledTimes(1));
    expect(updateChargeMock.mock.calls[0]?.[1]).toMatchObject({ amount: 5.9 });
  });

  it('says nothing while the amount is readable', () => {
    renderDrawer();
    expect(screen.queryByText(INVALID_AMOUNT)).toBeNull();
    expect(screen.getByTestId('charge-edit-amount')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('charge-edit-save')).toBeEnabled();
  });

  it.each([
    ['an empty field', ''],
    ['letters', 'abc'],
    ['zero', '0'],
  ])('refuses %s: Enregistrer waits, and the field says why', async (_label, value) => {
    renderDrawer();
    const { user, field } = await typeAmount(value);

    const save = screen.getByTestId('charge-edit-save');
    expect(save).toBeDisabled();
    const message = screen.getByText(INVALID_AMOUNT);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby') ?? '').toContain(message.id);
    expect(message.id).not.toBe('');

    await user.click(save);
    expect(updateChargeMock).not.toHaveBeenCalled();
  });
});
