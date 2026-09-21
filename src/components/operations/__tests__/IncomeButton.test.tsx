import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../messages/fr-BE.json';

const actions = vi.hoisted(() => ({
  income: vi.fn(async (_input: unknown) => ({ ok: true, data: { id: 'mv-2' } })),
}));
vi.mock('@/lib/actions/operations', () => ({ recordIncomeAction: actions.income }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AmountSheet } from '../AmountSheet';
import { IncomeButton } from '../IncomeButton';

const ACCOUNTS = [
  { accountType: 'income_bills' as const, label: 'Compte revenus' },
  { accountType: 'daily_card' as const, label: 'Carte du quotidien' },
];

function withIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      {node}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => actions.income.mockClear());

describe('IncomeButton — « Argent reçu »', () => {
  it('opens a sheet: amount, date today by default, account, nature, optional description', async () => {
    withIntl(<IncomeButton accounts={ACCOUNTS} today="2026-09-21" />);
    const button = screen.getByRole('button', { name: 'Argent reçu' });
    expect(button.textContent).toBe('Argent reçu');
    await userEvent.click(button);

    const sheet = screen.getByTestId('feuille-argent-recu');
    expect((within(sheet).getByLabelText('Reçu le') as HTMLInputElement).value).toBe('2026-09-21');
    expect((within(sheet).getByLabelText('Sur quel compte ?') as HTMLSelectElement).value).toBe(
      'income_bills',
    );
    expect(
      (within(sheet).getByRole('radio', { name: 'Mon revenu du mois' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(within(sheet).getByRole('radio', { name: 'En plus de mon revenu' })).toBeTruthy();
    expect(within(sheet).getByLabelText('Description (facultatif)')).toBeTruthy();
    // « Reçu », never « reçue » (DESIGN-v3: argent reçu is masculine).
    expect(sheet.textContent).not.toMatch(/reçue/i);
  });

  it('writes what was chosen, without a description when none is typed', async () => {
    withIntl(<IncomeButton accounts={ACCOUNTS} today="2026-09-21" />);
    await userEvent.click(screen.getByRole('button', { name: 'Argent reçu' }));
    const sheet = screen.getByTestId('feuille-argent-recu');
    await userEvent.type(within(sheet).getByLabelText('Combien as-tu reçu ?'), '705');
    await userEvent.selectOptions(within(sheet).getByLabelText('Sur quel compte ?'), 'daily_card');
    await userEvent.click(within(sheet).getByRole('radio', { name: 'En plus de mon revenu' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));
    expect(actions.income).toHaveBeenCalledWith({
      toAccountType: 'daily_card',
      amount: 705,
      occurredOn: '2026-09-21',
      nature: 'extra',
    });
  });

  it('sends the description without its surrounding spaces, then clears the field', async () => {
    withIntl(<IncomeButton accounts={ACCOUNTS} today="2026-09-21" />);
    await userEvent.click(screen.getByRole('button', { name: 'Argent reçu' }));
    const sheet = screen.getByTestId('feuille-argent-recu');
    await userEvent.type(within(sheet).getByLabelText('Combien as-tu reçu ?'), '505');
    await userEvent.type(within(sheet).getByLabelText('Description (facultatif)'), '  Prime  ');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));
    expect(actions.income).toHaveBeenCalledWith({
      toAccountType: 'income_bills',
      amount: 505,
      occurredOn: '2026-09-21',
      nature: 'regular',
      description: 'Prime',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Argent reçu' }));
    const again = screen.getByTestId('feuille-argent-recu');
    expect(
      (within(again).getByLabelText('Description (facultatif)') as HTMLInputElement).value,
    ).toBe('');
  });

  it('refuses a negative or empty amount before calling the server', async () => {
    withIntl(<IncomeButton accounts={ACCOUNTS} today="2026-09-21" />);
    await userEvent.click(screen.getByRole('button', { name: 'Argent reçu' }));
    const sheet = screen.getByTestId('feuille-argent-recu');
    await userEvent.type(within(sheet).getByLabelText('Combien as-tu reçu ?'), '-5');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));
    expect(actions.income).not.toHaveBeenCalled();
    expect(within(sheet).getByRole('alert')).toBeTruthy();
  });
});

describe('AmountSheet — a negative balance without a minus key', () => {
  it('uses the decimal pad, and an « overdrawn » switch gives the sign', async () => {
    const onSubmit = vi.fn(async (_amount: number, _day: string) => ({
      ok: true as const,
      data: undefined,
    }));
    withIntl(
      <AmountSheet
        open
        onClose={() => {}}
        testId="feuille-releve"
        title="Solde du jour"
        question="Quel est le solde de ce compte aujourd’hui ?"
        dateLabel="Lu le"
        initialAmount={null}
        initialDate="2026-09-21"
        allowNegative
        successMessage="ok"
        onSubmit={onSubmit}
      />,
    );
    const sheet = screen.getByTestId('feuille-releve');
    const amount = within(sheet).getByLabelText('Quel est le solde de ce compte aujourd’hui ?');
    expect(amount.getAttribute('inputmode')).toBe('decimal');
    await userEvent.type(amount, '42,50');
    await userEvent.click(
      within(sheet).getByRole('checkbox', { name: 'Ce compte est à découvert' }),
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).toHaveBeenCalledWith(-42.5, '2026-09-21');
  });

  it('a typed minus stays negative, with or without the switch', async () => {
    const onSubmit = vi.fn(async (_amount: number, _day: string) => ({
      ok: true as const,
      data: undefined,
    }));
    withIntl(
      <AmountSheet
        open
        onClose={() => {}}
        testId="feuille-releve"
        title="Solde du jour"
        question="Solde ?"
        dateLabel="Lu le"
        initialAmount={null}
        initialDate="2026-09-21"
        allowNegative
        successMessage="ok"
        onSubmit={onSubmit}
      />,
    );
    const sheet = screen.getByTestId('feuille-releve');
    await userEvent.type(within(sheet).getByLabelText('Solde ?'), '-50');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));
    await userEvent.click(within(sheet).getByRole('checkbox'));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit.mock.calls.map((c) => c[0])).toEqual([-50, -50]);
  });

  it('shows no overdraft switch where an amount cannot be negative', () => {
    withIntl(
      <AmountSheet
        open
        onClose={() => {}}
        testId="feuille-virement"
        title="t"
        question="Combien as-tu viré ?"
        dateLabel="Viré le"
        initialAmount={null}
        initialDate="2026-09-21"
        allowNegative={false}
        successMessage="ok"
        onSubmit={async () => ({ ok: true as const, data: undefined })}
      />,
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
