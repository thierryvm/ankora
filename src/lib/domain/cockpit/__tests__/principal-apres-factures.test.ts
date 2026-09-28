import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import type { MonthObligation } from '@/lib/domain/obligations/types';
import { principalApresFactures } from '@/lib/domain/cockpit/principal-apres-factures';

/**
 * « Sur ton compte principal après tes factures de <mois> ».
 *
 * The figure the transfer fold used to show (`netPrincipalAfterPlan`) started
 * from the PLANNED income and subtracted every bill of the month, paid or not.
 * This one starts from the main account's balance as computed from its
 * operations — which already went down with every bill ticked paid, since a
 * paid bill always leaves `income_bills` (ADR-045 D22) — and subtracts only
 * what is still to pay.
 *
 * Fictitious household (public repo): the 505 € / 705 € family.
 */

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

const LOYER = obligation({
  id: 'loyer',
  label: 'Loyer',
  amountDue: new Decimal(505),
  paymentDay: 5,
});
const ASSURANCE = obligation({
  id: 'assurance',
  label: 'Assurance habitation',
  amountDue: new Decimal(105),
  paymentDay: 12,
});
const PRET = obligation({
  id: 'pret',
  source: 'commitment',
  label: 'Prêt voiture',
  amountDue: new Decimal(95),
  paymentDay: 20,
  installmentIndex: 5,
  installmentsTotal: 24,
});
const ELECTRICITE_PAYEE = obligation({
  id: 'electricite',
  label: 'Électricité',
  amountDue: new Decimal(100),
  paymentDay: 2,
  isPaid: true,
});

const OCTOBRE = { year: 2026, month: 10 };

const calcul = (
  soldePrincipal: Decimal | null,
  obligations: readonly MonthObligation[],
  ref = OCTOBRE,
) => principalApresFactures({ soldePrincipal, obligations, ref });

describe('principalApresFactures', () => {
  it('subtracts only what is still to pay from the computed main balance', () => {
    const r = calcul(new Decimal(1705), [ELECTRICITE_PAYEE, LOYER, ASSURANCE, PRET]);

    expect(r).not.toBeNull();
    expect(r!.solde.toNumber()).toBe(1705);
    // The paid bill is NOT subtracted again: the computed balance already went
    // down with it (ADR-045 D22).
    expect(r!.lignes.map((l) => l.id)).toEqual(['loyer', 'assurance', 'pret']);
    expect(r!.aPayer.toNumber()).toBe(705);
    expect(r!.montant.toNumber()).toBe(1000);
  });

  it('carries each line with its name, amount, day and instalment position', () => {
    const r = calcul(new Decimal(1705), [LOYER, PRET]);

    expect(r!.lignes).toEqual([
      {
        id: 'loyer',
        source: 'charge',
        label: 'Loyer',
        montant: new Decimal(505),
        jour: 5,
        rang: null,
      },
      {
        id: 'pret',
        source: 'commitment',
        label: 'Prêt voiture',
        montant: new Decimal(95),
        jour: 20,
        rang: { index: 5, total: 24 },
      },
    ]);
  });

  it('the figure is always the balance minus the sum of its lines (rule 10)', () => {
    const r = calcul(new Decimal('1705.40'), [LOYER, ASSURANCE, PRET, ELECTRICITE_PAYEE])!;
    const somme = r.lignes.reduce((acc, l) => acc.plus(l.montant), new Decimal(0));

    expect(r.aPayer.equals(somme)).toBe(true);
    expect(r.montant.equals(r.solde.minus(somme))).toBe(true);
  });

  it('keeps the balance as the figure when everything is paid', () => {
    const r = calcul(new Decimal(505), [{ ...LOYER, isPaid: true }])!;

    expect(r.lignes).toEqual([]);
    expect(r.aPayer.toNumber()).toBe(0);
    expect(r.montant.toNumber()).toBe(505);
  });

  it('goes negative when the bills still due exceed the balance', () => {
    const r = calcul(new Decimal(500), [LOYER, ASSURANCE])!;

    expect(r.montant.toNumber()).toBe(-110);
  });

  it('clamps a due day past the end of the month to its last day', () => {
    const r = calcul(new Decimal(1705), [{ ...LOYER, paymentDay: 31 }], { year: 2026, month: 9 })!;

    expect(r.lignes[0]!.jour).toBe(30);
  });

  it('gives no figure at all without a known balance — never 0', () => {
    expect(calcul(null, [LOYER, ASSURANCE])).toBeNull();
  });

  it('refuses a negative amount due rather than silently adding money', () => {
    expect(() => calcul(new Decimal(1705), [{ ...LOYER, amountDue: new Decimal(-505) }])).toThrow(
      RangeError,
    );
  });
});
