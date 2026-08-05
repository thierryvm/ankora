import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';
import { formatCurrency } from '@/lib/i18n/formatters';

/** Le solde de la carte Principal, tel qu'il apparaitrait s'il etait rendu en texte. */
const MONTANT_EN_TEXTE = /2\s*637/;

vi.mock('@/lib/actions/accounts', () => ({
  updateAccountBalanceAction: vi.fn(),
  updateMonthlyIncomeAction: vi.fn(),
  updateVieCouranteTransferAction: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { AccountsClient } from '../AccountsClient';

const ACCOUNTS = [
  { kind: 'principal' as const, label: 'Compte Principal', balance: 2637 },
  { kind: 'vie_courante' as const, label: 'Vie Courante', balance: 300 },
  { kind: 'epargne' as const, label: 'Compte Épargne', balance: 1460 },
];

function renderClient() {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <AccountsClient monthlyIncome={2693} vieCouranteMonthlyTransfer={500} accounts={ACCOUNTS} />
    </NextIntlClientProvider>,
  );
}

describe('AccountsClient — un solde, un seul rendu', () => {
  /**
   * Le test de non-régression du défaut signalé le 5 août 2026 : la carte
   * rendait le solde DEUX fois — un gros chiffre formaté, puis le champ juste
   * dessous. Les deux divergeaient dès la première frappe.
   *
   * L'assertion porte sur le nombre d'occurrences du montant dans le DOM, pas
   * sur l'absence d'un sélecteur de style : une classe Tailwind peut changer
   * sans que le doublon revienne, et le doublon peut revenir sous une autre
   * classe. C'est la duplication qui est interdite, pas une mise en forme.
   */
  it('ne rend le solde qu’une fois, dans le champ', () => {
    renderClient();

    const champ = screen.getByLabelText(/solde actuel de Compte Principal/i);
    expect(champ).toHaveValue(2637);

    // Aucun autre nœud ne porte ce montant — ni « 2 637 € », ni « 2637 ».
    const montantFormate = screen.queryAllByText(MONTANT_EN_TEXTE);
    expect(
      montantFormate,
      'le solde ne doit apparaître que dans le champ, jamais en double',
    ).toHaveLength(0);
  });

  /**
   * Le témoin de l'assertion précédente.
   *
   * `expect(...).toHaveLength(0)` passe aussi bien quand le doublon a disparu
   * que quand le motif ne peut rien attraper — et la seconde raison est
   * plausible ici : `formatCurrency` en fr-BE sépare les milliers par une
   * espace fine insécable (U+202F), pas par un espace ordinaire. Un motif
   * naïf rendrait le test vert pour toujours, quoi qu'on remette dans la carte.
   *
   * Ce cas rend le balisage exact que la carte portait avant correction et
   * vérifie que le motif le trouve. Si l'un des deux cède, c'est celui-ci qui
   * rougit, et il dit lequel.
   */
  it('le motif du test précédent attrape bien un solde rendu en texte', () => {
    render(
      <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
        <p className="mb-3 text-2xl font-bold tabular-nums">{formatCurrency(2637, 'fr-BE')}</p>
      </NextIntlClientProvider>,
    );

    expect(
      screen.queryAllByText(MONTANT_EN_TEXTE),
      "le motif doit attraper le doublon qu'il est censé interdire",
    ).toHaveLength(1);
  });

  /**
   * `computeMonthlyTransferPlan` ne prend AUCUN solde en entrée (vérifié :
   * `src/lib/domain/transfer.ts` reçoit charges / month / monthlyIncome /
   * vieCouranteMonthlyTransfer / commitmentsDue). Le seul consommateur d'un
   * solde dans un calcul est `month-situation.ts`, filtré sur
   * `accountType === 'provisions'`.
   *
   * L'ancien sous-titre — « Saisis tes soldes réels pour qu'Ankora calcule
   * précisément ton virement intelligent » — était donc faux pour les trois
   * comptes. Ce test empêche qu'on le réintroduise sans réintroduire d'abord
   * le calcul qu'il promet.
   */
  it('dit que le solde est saisi à la main, et à quoi il sert vraiment', () => {
    renderClient();

    const mentions = screen.getAllByText(/saisi à la main/i);
    expect(mentions, 'les trois cartes portent la mention').toHaveLength(3);

    expect(screen.getAllByText(/n.entre dans aucun calcul/i)).toHaveLength(2);
    expect(screen.getByText(/jauge de provisions/i)).toBeInTheDocument();
  });

  /**
   * La mention n'est utile que si un lecteur d'écran l'entend en atteignant le
   * champ. Sans `aria-describedby`, c'est un paragraphe que la navigation au
   * clavier peut franchir sans jamais l'annoncer.
   */
  it('rattache la mention au champ pour les lecteurs d’écran', () => {
    renderClient();

    const champ = screen.getByLabelText(/solde actuel de Compte Principal/i);
    const decritPar = champ.getAttribute('aria-describedby');
    expect(decritPar).toBe('balance-notice-principal');

    const mention = document.getElementById(decritPar as string);
    expect(mention).not.toBeNull();
    expect(mention?.textContent).toMatch(/saisi à la main/i);
  });

  /**
   * `e2e/accounts.spec.ts:55` remonte au parent du champ (`..`, soit le
   * `<form>`) et y cherche `getByRole('button')` en mode strict. Un second
   * élément interactif dans ce formulaire casserait la spec — d'où le
   * paragraphe rendu HORS du formulaire.
   */
  it('ne laisse qu’un seul bouton dans le formulaire de solde', () => {
    renderClient();

    const champ = screen.getByLabelText(/solde actuel de Compte Principal/i);
    const formulaire = champ.closest('form');
    expect(formulaire).not.toBeNull();
    expect(formulaire?.querySelectorAll('button')).toHaveLength(1);
  });
});
