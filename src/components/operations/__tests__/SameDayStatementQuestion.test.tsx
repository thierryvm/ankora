import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../messages/fr-BE.json';

const actions = vi.hoisted(() => ({
  income: vi.fn(async (_input: unknown) => ({ ok: true, data: { id: 'mv-2' } })),
  transfer: vi.fn(async (_input: unknown) => ({ ok: true, data: { id: 'mv-3' } })),
}));
vi.mock('@/lib/actions/operations', () => ({
  recordIncomeAction: actions.income,
  recordPlannedTransferAction: actions.transfer,
  setMovementCancelledAction: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { IncomeButton } from '../IncomeButton';
import { TransferDoneControl } from '../TransferDoneControl';

/*
 * ADR-045 D21 — « Ton solde du {date} ({montant}) contient-il déjà cet
 * argent ? » is asked only when the date of the operation is the day of the
 * account's statement, and the sheet does not save until it is answered.
 */

const ACCOUNTS = [
  { accountType: 'income_bills' as const, label: 'Compte revenus' },
  { accountType: 'daily_card' as const, label: 'Carte du quotidien' },
];
// Fictional figures (famille 505 € / 705 €).
const STATEMENTS = { income_bills: { statedOn: '2026-09-28', balance: 705 } };
const QUESTION =
  /Ton solde du 28 septembre \(705[\u00a0\u202f]€\) contient-il déjà cet argent[\u00a0\u202f ]\?/;

function withIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      {node}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  actions.income.mockClear();
  actions.transfer.mockClear();
});

async function openIncome(statements = STATEMENTS) {
  withIntl(
    <IncomeButton accounts={ACCOUNTS} today="2026-09-28" moisServis={[]} statements={statements} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Argent reçu' }));
  const sheet = screen.getByTestId('feuille-argent-recu');
  const amount = within(sheet).getByLabelText('Combien as-tu reçu ?');
  await waitFor(() => expect(document.activeElement).toBe(amount));
  await userEvent.type(amount, '505');
  return sheet;
}

describe('IncomeButton — the question on the balance of the day', () => {
  it('asks it on the day of the statement, and the button says what is missing', async () => {
    const sheet = await openIncome();
    const question = within(sheet).getByTestId('question-solde-income_bills');
    expect(question.textContent).toMatch(QUESTION);
    // No answer by default.
    for (const radio of within(question).getAllByRole('radio')) {
      expect((radio as HTMLInputElement).checked).toBe(false);
    }
    const blocked = within(sheet).getByRole('button', {
      name: 'Réponds d’abord à la question sur ton solde',
    });
    expect((blocked as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(blocked);
    expect(actions.income).not.toHaveBeenCalled();
  });

  it('sends « included » once « Oui, déjà dedans » is chosen', async () => {
    const sheet = await openIncome();
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Oui, déjà dedans' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));
    expect(actions.income).toHaveBeenCalledWith(
      expect.objectContaining({
        toAccountType: 'income_bills',
        occurredOn: '2026-09-28',
        statementAnswers: { income_bills: 'included' },
      }),
    );
  });

  it('does not ask on another day, nor for another account — and sends no answer', async () => {
    const sheet = await openIncome();
    await userEvent.selectOptions(within(sheet).getByLabelText('Sur quel compte ?'), 'daily_card');
    expect(within(sheet).queryByTestId('question-solde-daily_card')).toBeNull();
    expect(within(sheet).queryByTestId('question-solde-income_bills')).toBeNull();
    await userEvent.selectOptions(
      within(sheet).getByLabelText('Sur quel compte ?'),
      'income_bills',
    );
    const date = within(sheet).getByLabelText('Reçu le');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-09-27');
    expect(within(sheet).queryByTestId('question-solde-income_bills')).toBeNull();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));
    const sent = actions.income.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent.occurredOn).toBe('2026-09-27');
    expect('statementAnswers' in sent).toBe(false);
  });
});

describe('TransferDoneControl — the question for each account touched', () => {
  it('asks for the account the transfer leaves, and sends « notYet »', async () => {
    withIntl(
      <TransferDoneControl
        lineLabel="Vers le quotidien"
        fromAccountType="income_bills"
        toAccountType="daily_card"
        suggested={505}
        plannedProvisions={0}
        planYear={2026}
        planMonth={10}
        today="2026-09-28"
        line={{ state: 'todo', cancelledId: null }}
        statements={STATEMENTS}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /J’ai fait ce virement/ }));
    const sheet = screen.getByTestId('feuille-virement');
    expect(within(sheet).getByTestId('question-solde-income_bills').textContent).toMatch(QUESTION);
    expect(
      (
        within(sheet).getByRole('button', {
          name: 'Réponds d’abord à la question sur ton solde',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Non, pas encore' }));
    // Tour 55 — the amount starts empty and must be typed before saving.
    await userEvent.type(within(sheet).getByLabelText('Combien as-tu viré ?'), '505');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));
    expect(actions.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ statementAnswers: { income_bills: 'notYet' } }),
    );
  });
});
