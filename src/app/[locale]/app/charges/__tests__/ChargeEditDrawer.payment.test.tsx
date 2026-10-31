/**
 * « Modifier la facture » — what the drawer says about this month's payment
 * once the amount is corrected.
 *
 * A payment recorded at the bill's previous amount follows it, and the
 * confirmation says so (« passe de … à … »). One typed by hand stays, and it says so too,
 * in one sentence, with that amount. Figures are fictitious.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';
import messagesEn from '../../../../../../messages/en.json';
import { waitForSheetFocus } from '../../../../../../tests/helpers/sheet';

const updateChargeMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/charges', () => ({
  updateChargeAction: updateChargeMock,
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: toastSuccessMock, error: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { ChargeEditDrawer, type ChargeEditDrawerCharge } from '../ChargeEditDrawer';

const CHARGE: ChargeEditDrawerCharge = {
  id: '3f6c1a52-8e1b-4c3d-9a7e-2b5d6f8a9c01',
  label: 'Assurance habitation',
  amount: 505,
  frequency: 'monthly',
  dueMonth: 1,
  paymentDay: 5,
  paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

async function correctAmountTo(value: string, locale: 'fr-BE' | 'en' = 'fr-BE') {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? messagesEn : messages}
      timeZone="Europe/Brussels"
    >
      <ChargeEditDrawer charge={CHARGE} onClose={() => {}} />
    </NextIntlClientProvider>,
  );
  const user = userEvent.setup();
  // The drawer focuses its label field one frame after opening; typing before
  // that frame races it (see the helper).
  await waitForSheetFocus();
  const field = screen.getByTestId('charge-edit-amount');
  await user.clear(field);
  await user.type(field, value);
  expect(field).toHaveValue(value);
  await user.click(screen.getByRole('button', { name: locale === 'en' ? 'Save' : 'Enregistrer' }));
  await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
}

describe('ChargeEditDrawer — this month’s payment after an amount correction', () => {
  beforeEach(() => {
    updateChargeMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it('says that a payment typed by hand did not change, with its amount', async () => {
    updateChargeMock.mockResolvedValue({
      ok: true,
      payment: { kind: 'kept', periodYear: 2026, periodMonth: 10, paidAmount: 480.5 },
    });
    await correctAmountTo('705');
    expect(updateChargeMock.mock.calls[0]![1]).toMatchObject({ amount: 705 });
    const [title, options] = toastSuccessMock.mock.calls[0]!;
    expect(title).toBe('Facture mise à jour');
    expect(options.description).toMatch(
      /^Le paiement pour octobre, 480,50[\u00a0\u202f]€, n'a pas changé\.$/,
    );
  });

  it('says that a payment which should have followed did not, with the amount it keeps', async () => {
    updateChargeMock.mockResolvedValue({
      ok: true,
      payment: { kind: 'unchanged', periodYear: 2026, periodMonth: 10, paidAmount: 505 },
    });
    await correctAmountTo('705');
    expect(toastSuccessMock.mock.calls[0]![1].description).toMatch(
      /^Le paiement pour octobre, 505[\u00a0\u202f]€, n'a pas changé\.$/,
    );
  });

  it('writes the month with its capital in English', async () => {
    updateChargeMock.mockResolvedValue({
      ok: true,
      payment: { kind: 'kept', periodYear: 2026, periodMonth: 10, paidAmount: 480.5 },
    });
    await correctAmountTo('705', 'en');
    expect(toastSuccessMock.mock.calls[0]![1].description).toMatch(
      /^The payment for October, .*480\.50, has not changed\.$/,
    );
  });

  it('says the payment goes from the old amount to the new one', async () => {
    updateChargeMock.mockResolvedValue({
      ok: true,
      payment: {
        kind: 'followed',
        periodYear: 2026,
        periodMonth: 10,
        paidAmount: 705.5,
        previousAmount: 505,
      },
    });
    await correctAmountTo('705');
    const [title, options] = toastSuccessMock.mock.calls[0]!;
    expect(title).toBe('Facture mise à jour');
    expect(options.description).toMatch(
      /^Le paiement pour octobre passe de 505[  ]€ à 705,50[  ]€\.$/,
    );
  });

  it('writes the followed payment in English with the month capitalised', async () => {
    updateChargeMock.mockResolvedValue({
      ok: true,
      payment: {
        kind: 'followed',
        periodYear: 2026,
        periodMonth: 10,
        paidAmount: 705.5,
        previousAmount: 505,
      },
    });
    await correctAmountTo('705', 'en');
    expect(toastSuccessMock.mock.calls[0]![1].description).toMatch(
      /^The payment for October goes from .*505 to .*705\.50\.$/,
    );
  });

  it('adds nothing when there is no payment this month', async () => {
    updateChargeMock.mockResolvedValue({ ok: true });
    await correctAmountTo('705');
    expect(toastSuccessMock).toHaveBeenCalledWith('Facture mise à jour', undefined);
  });

  it('types the amount into the amount field even when the drawer’s first frame comes late', async () => {
    // CI run 41189853415: the frame that focuses the label field landed between
    // `user.type`'s click on the amount and its first key, so « 705 » went into
    // the label and the amount stayed empty. Here the frame is held until that
    // exact click (or 200 ms, so a helper that waits for it is not left
    // hanging). Without `waitForSheetFocus` in the helper this case fails.
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    const flush = () => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb(performance.now());
    };
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      pending.set(++nextId, cb);
      window.setTimeout(flush, 200);
      return nextId;
    });
    const caf = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => void pending.delete(id));
    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).dataset.testid === 'charge-edit-amount') flush();
    };
    document.addEventListener('click', onClick, true);
    try {
      updateChargeMock.mockResolvedValue({ ok: true });
      await correctAmountTo('705');
      expect(updateChargeMock.mock.calls[0]![1]).toMatchObject({
        label: 'Assurance habitation',
        amount: 705,
      });
    } finally {
      document.removeEventListener('click', onClick, true);
      raf.mockRestore();
      caf.mockRestore();
    }
  });
});
