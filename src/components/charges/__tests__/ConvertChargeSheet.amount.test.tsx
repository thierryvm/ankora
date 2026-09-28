/**
 * « Convertir en engagement » — the two AMOUNT doors read what a francophone
 * types.
 *
 * « Solde restant dû » and « total dont tu te souviens » were `type="number"`:
 * « 5,90 » was blanked, the door read as unanswered, and a « 1.234,56 » copied
 * from a statement became NaN. Both are optional — empty means « not known »,
 * never invalid — but a typed value that cannot be read blocks the submit and
 * says so: a door silently dropped is a figure silently lost. The count and
 * the year are whole numbers and are not touched. Typed key by key.
 * Figures are fictitious.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../messages/fr-BE.json';

const convertMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/charge-conversion', () => ({
  convertChargeToCommitmentAction: convertMock,
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ConvertChargeSheet, type ConvertibleCharge } from '../ConvertChargeSheet';

const INVALID_AMOUNT = 'Écris un montant supérieur à 0, avec une virgule ou un point.';

/** One instalment of 5,90 € a month: a balance of 5,90 € is exactly one left. */
const CHARGE: ConvertibleCharge = {
  id: '3f6c1a52-8e1b-4c3d-9a7e-2b5d6f8a9c01',
  label: 'Abonnement',
  amount: 5.9,
  frequency: 'monthly',
  paymentDay: 5,
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

function renderSheet() {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <ConvertChargeSheet charge={CHARGE} onClose={() => {}} locale="fr-BE" />
    </NextIntlClientProvider>,
  );
}

const balanceField = () => screen.getByLabelText('Solde restant dû (relevé)');
const rememberedField = () =>
  screen.getByLabelText('Total restant dont tu te souviens (facultatif)');

describe('ConvertChargeSheet — the amount doors read « 5,90 » as 5.9', () => {
  beforeEach(() => {
    convertMock.mockReset();
    convertMock.mockResolvedValue({ ok: true, data: { endYear: 2026, endMonth: 10 } });
  });

  it('both amount doors are text fields with a decimal keypad', () => {
    renderSheet();
    for (const field of [balanceField(), rememberedField()]) {
      expect(field).toHaveAttribute('type', 'text');
      expect(field).toHaveAttribute('inputmode', 'decimal');
    }
  });

  it('sends a remaining balance of 5.9 when « 5,90 » is typed', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(balanceField(), '5,90');
    await user.click(screen.getByTestId('convert-charge-submit'));
    await waitFor(() => expect(convertMock).toHaveBeenCalledTimes(1));
    expect(convertMock.mock.calls[0]?.[0]).toMatchObject({
      chargeId: CHARGE.id,
      soldeRestantDu: 5.9,
    });
  });

  it('reads a remembered « 1.234,56 » as 1 234,56 €, and names the gap', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(balanceField(), '5,90');
    await user.type(rememberedField(), '1.234,56');
    expect(screen.getByTestId('convert-charge-remembered-divergence')).toHaveTextContent(
      /1[   ]234,56/,
    );
  });

  it('says nothing about an empty door — optional means « not known », not invalid', () => {
    renderSheet();
    expect(screen.queryByText(INVALID_AMOUNT)).toBeNull();
    expect(balanceField()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('blocks the submit on an unreadable balance, and the field says why', async () => {
    const user = userEvent.setup();
    renderSheet();
    // A valid door elsewhere: without the guard, the typed balance would be
    // dropped in silence and the conversion would go through without it.
    await user.type(screen.getByLabelText('Nombre d’échéances restantes'), '2');
    const balance = balanceField();
    await user.type(balance, 'abc');
    const submit = screen.getByTestId('convert-charge-submit');
    expect(submit).toBeDisabled();
    const message = screen.getByText(INVALID_AMOUNT);
    expect(balance).toHaveAttribute('aria-invalid', 'true');
    expect(message.id).not.toBe('');
    expect(balance.getAttribute('aria-describedby') ?? '').toContain(message.id);
    await user.click(submit);
    expect(convertMock).not.toHaveBeenCalled();
  });
});
