import Decimal from 'decimal.js';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { principalApresFactures } from '@/lib/domain/cockpit/principal-apres-factures';
import type { MonthObligation } from '@/lib/domain/obligations/types';
import { formatCurrency } from '@/lib/i18n/formatters';

import {
  PrincipalApresFactures,
  type PrincipalApresFacturesLabels,
} from '../PrincipalApresFactures';

// Fictitious household (public repo): the 505 € / 705 € family.
const obligation = (over: Partial<MonthObligation> & Pick<MonthObligation, 'id'>) =>
  ({
    source: 'charge',
    label: over.id,
    amountDue: new Decimal(0),
    paymentDay: 1,
    isPaid: false,
    installmentIndex: null,
    installmentsTotal: null,
    ...over,
  }) satisfies MonthObligation;

const OBLIGATIONS = [
  obligation({
    id: 'electricite',
    label: 'Électricité',
    amountDue: new Decimal(100),
    isPaid: true,
  }),
  obligation({ id: 'loyer', label: 'Loyer', amountDue: new Decimal(505), paymentDay: 5 }),
  obligation({
    id: 'pret',
    source: 'commitment',
    label: 'Prêt voiture',
    amountDue: new Decimal(95),
    paymentDay: 20,
    installmentIndex: 5,
    installmentsTotal: 24,
  }),
];

const LABELS: PrincipalApresFacturesLabels = {
  titre: 'Sur ton compte principal après tes factures d’octobre',
  toggle: 'Détail : compte principal après tes factures',
  solde: 'Solde calculé du compte principal',
  resultat: 'Après tes factures',
  absence: 'Aucun solde connu pour ton compte principal : ajoute un relevé dans Mes comptes.',
};

const fmt = (v: number) => formatCurrency(v, 'fr-BE');
// Amounts are compared on the raw `textContent`: `toHaveTextContent` collapses
// the narrow no-break spaces `Intl` writes, and would then never match `fmt()`.
const texte = (el: Element) => el.textContent ?? '';

/** What the page does: the domain computes, the page converts to numbers. */
function detail(soldePrincipal: Decimal | null) {
  const r = principalApresFactures({
    soldePrincipal,
    obligations: OBLIGATIONS,
    ref: { year: 2026, month: 10 },
  });
  return r === null
    ? null
    : {
        solde: r.solde.toNumber(),
        montant: r.montant.toNumber(),
        lignes: r.lignes.map((l) => ({
          id: l.id,
          label: l.label,
          montant: l.montant.toNumber(),
          quand: `le ${l.jour}`,
        })),
      };
}

describe('PrincipalApresFactures', () => {
  it('shows the figure, and opens on the balance, each bill still due, then the result', () => {
    render(
      <PrincipalApresFactures detail={detail(new Decimal(1705))} labels={LABELS} locale="fr-BE" />,
    );
    const bloc = screen.getByTestId('principal-apres-factures');

    expect(within(bloc).getByText(LABELS.titre)).toBeInTheDocument();
    const chiffre = within(bloc).getByTestId('principal-apres-factures-montant');
    expect(texte(chiffre)).toBe(fmt(1105));
    expect(chiffre.className).toContain('text-success');

    // The decomposition is a real disclosure, closed until asked.
    expect(bloc).toBeInstanceOf(HTMLDetailsElement);
    expect((bloc as HTMLDetailsElement).open).toBe(false);
    expect(bloc.querySelector('summary')).toHaveTextContent(LABELS.titre);

    expect(within(bloc).getByTestId('principal-apres-factures-solde')).toHaveTextContent(
      LABELS.solde,
    );
    expect(texte(within(bloc).getByTestId('principal-apres-factures-solde'))).toContain(fmt(1705));

    const lignes = within(bloc).getAllByTestId('principal-apres-factures-ligne');
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toHaveTextContent('Loyer');
    expect(lignes[0]).toHaveTextContent('le 5');
    expect(texte(lignes[0]!)).toContain(fmt(505));
    expect(lignes[1]).toHaveTextContent('Prêt voiture');
    expect(texte(lignes[1]!)).toContain(fmt(95));
    // A paid bill already left the balance: it is not listed again.
    expect(within(bloc).queryByText('Électricité')).toBeNull();

    const resultat = within(bloc).getByTestId('principal-apres-factures-resultat');
    expect(resultat).toHaveTextContent(LABELS.resultat);
    expect(texte(resultat)).toContain(fmt(1705 - 505 - 95));
  });

  it('the total shown is the balance minus the lines shown', () => {
    const d = detail(new Decimal('1705.40'))!;
    render(<PrincipalApresFactures detail={d} labels={LABELS} locale="fr-BE" />);

    const somme = d.lignes.reduce((s, l) => s + l.montant, 0);
    expect(texte(screen.getByTestId('principal-apres-factures-montant'))).toBe(
      fmt(d.solde - somme),
    );
  });

  it('turns danger when the bills still due exceed the balance', () => {
    render(
      <PrincipalApresFactures detail={detail(new Decimal(500))} labels={LABELS} locale="fr-BE" />,
    );

    const chiffre = screen.getByTestId('principal-apres-factures-montant');
    expect(texte(chiffre)).toBe(fmt(-100));
    expect(chiffre.className).toContain('text-danger');
  });

  it('says there is no balance instead of showing 0 €', () => {
    render(<PrincipalApresFactures detail={detail(null)} labels={LABELS} locale="fr-BE" />);
    const bloc = screen.getByTestId('principal-apres-factures');

    expect(within(bloc).getByText(LABELS.titre)).toBeInTheDocument();
    expect(within(bloc).getByTestId('principal-apres-factures-absent')).toHaveTextContent(
      LABELS.absence,
    );
    expect(within(bloc).queryByTestId('principal-apres-factures-montant')).toBeNull();
    expect(texte(bloc)).not.toContain(fmt(0));
  });
});
