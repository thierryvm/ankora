import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

vi.mock('@/lib/actions/accounts', () => ({
  updateMonthlyIncomeAction: vi.fn(),
  updateVieCouranteTransferAction: vi.fn(),
}));
vi.mock('@/lib/actions/operations', () => ({
  recordBalanceStatementAction: vi.fn(async () => ({ ok: true, data: { id: 'x' } })),
  setStatementCancelledAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { AccountsClient, type AccountBalanceProps } from '../AccountsClient';

/*
 * PR C bis — the balance of an account is a dated statement, not a field.
 * Each display rule set by the pilot on 2026-09-21 has its case here.
 * Figures are fictitious (the 505 / 705 family of the e2e seed).
 */

const START: AccountBalanceProps = {
  kind: 'principal',
  accountType: 'income_bills',
  label: 'Compte revenus',
  view: {
    readId: 's1',
    readBalance: 705,
    readStatedOn: '2026-09-21',
    readIsStartingBalance: true,
    computed: null,
    gap: null,
    reopenable: null,
  },
};
const READ_NEGATIVE: AccountBalanceProps = {
  kind: 'vie_courante',
  accountType: 'daily_card',
  label: 'Carte du quotidien',
  view: {
    readId: 's2',
    readBalance: -42.5,
    readStatedOn: '2026-09-17',
    readIsStartingBalance: false,
    computed: 462.5,
    gap: { expected: 520, read: -42.5, amount: 562.5 },
    reopenable: null,
  },
};
const PROVISIONS: AccountBalanceProps = {
  kind: 'epargne',
  accountType: 'provisions',
  label: 'Provisions pour tes factures',
  view: null,
};

function renderClient() {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <AccountsClient
        monthlyIncome={2000}
        vieCouranteMonthlyTransfer={505}
        balances={[START, READ_NEGATIVE, PROVISIONS]}
        today="2026-09-21"
      />
    </NextIntlClientProvider>,
  );
}

const card = (type: string) =>
  document.querySelector(`[data-account-balance="${type}"]`) as HTMLElement;

describe('AccountsClient — un solde lu, daté, et nommé pour ce qu’il est', () => {
  it('appelle le premier relevé « solde de départ », jamais « relevé » ni « lu »', () => {
    renderClient();
    const lu = within(card('income_bills')).getByTestId('solde-lu');
    expect(lu).toHaveTextContent(/Solde de départ, le 21 septembre/);
    expect(lu.textContent).not.toMatch(/relev|lu le/i);
  });

  it('date un solde lu par stated_on, pas par la fin du mois', () => {
    renderClient();
    const lu = within(card('daily_card')).getByTestId('solde-lu');
    expect(lu).toHaveTextContent('Solde lu le 17 septembre');
    expect(lu.textContent).not.toMatch(/30 septembre/);
  });

  it('ne dit jamais « calculé » d’un solde lu, ni « relevé » ou « lu » d’un solde calculé', () => {
    renderClient();
    const c = card('daily_card');
    expect(within(c).getByTestId('solde-lu').textContent).not.toMatch(/calcul/i);
    const calcule = within(c).getByTestId('solde-calcule');
    expect(calcule).toHaveTextContent('Calculé depuis tes opérations');
    expect(calcule.textContent).not.toMatch(/relev|\blu\b/i);
  });

  it('affiche un solde négatif tel quel, sans couleur d’alarme', () => {
    renderClient();
    const lu = within(card('daily_card')).getByTestId('solde-lu');
    const montant = lu.querySelector('p.font-mono') as HTMLElement;
    expect(montant.textContent).toMatch(/-\s*42,50|−\s*42,50/);
    expect(montant.className).not.toMatch(/danger|destructive|red|warning/);
  });

  it('ne rend chaque solde qu’une fois', () => {
    renderClient();
    expect(within(card('income_bills')).getAllByText(/705/)).toHaveLength(1);
  });

  it('dit l’écart sans accuser : il nomme ce qu’Ankora ne suit pas encore', () => {
    renderClient();
    const repli = screen.getByTestId('ecart-daily_card');
    expect(repli.textContent).toMatch(/Écart avec tes opérations/);
    const explication = messages.operations.statement.gapExplain;
    expect(explication).toMatch(/ne suit pas encore/);
    expect(explication).not.toMatch(/tu as oublié(?! quelque chose\.)|erreur|faute/);
  });

  it('ne laisse pas annuler un solde de départ, mais bien un solde lu', () => {
    renderClient();
    expect(
      within(card('income_bills')).queryByRole('button', { name: 'Annuler ce solde' }),
    ).toBeNull();
    expect(
      within(card('daily_card')).getByRole('button', { name: 'Annuler ce solde' }),
    ).toBeTruthy();
  });

  it('pose la question du jour dans une feuille sans champ de nom ni de rôle', async () => {
    renderClient();
    await userEvent.click(
      within(card('provisions')).getByRole('button', {
        name: 'Écrire le solde du jour de Provisions pour tes factures',
      }),
    );
    const feuille = screen.getByTestId('feuille-releve');
    const champs = within(feuille).getAllByRole('textbox');
    expect(champs).toHaveLength(1);
    expect(
      within(feuille).getByLabelText('Quel est le solde de ce compte aujourd’hui ?'),
    ).toBeTruthy();
    expect(feuille.querySelectorAll('select, [role="combobox"]')).toHaveLength(0);
    expect(within(feuille).queryByDisplayValue('Provisions pour tes factures')).toBeNull();
  });

  it('garde une phrase d’usage vraie : deux comptes n’entrent dans aucun calcul, les provisions servent la jauge', () => {
    renderClient();
    expect(card('income_bills')).toHaveTextContent("N'entre dans aucun calcul pour l'instant.");
    expect(card('provisions')).toHaveTextContent(
      'Sert à la jauge de provisions du tableau de bord.',
    );
    expect(document.body.textContent).not.toMatch(/Saisi à la main/);
  });
});
