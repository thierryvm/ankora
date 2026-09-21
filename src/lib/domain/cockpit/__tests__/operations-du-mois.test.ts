import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import {
  AUCUNE_OPERATION,
  operationsDuMois,
  type OperationDuJournal,
} from '@/lib/domain/cockpit/operations-du-mois';
import { calculerSituationDuMois } from '@/lib/domain/cockpit/situation-mois';
import type { CockpitCharge, ReferencePeriod } from '@/lib/domain/cockpit/types';

/**
 * PR D — the truth table of « Il te reste » (option B, decided with @thierry on
 * 18 September 2026):
 *
 *   Il te reste = Revenus − monthly bills − smoothed effort − instalments
 *                 − put aside − spent
 *
 * Every amount is FICTITIOUS (the 505 € / 705 € family of the fixtures). One
 * case per line of the table. The base month, with no operation at all:
 *
 *   2 000 − 505 − 150 − 100 − 245 = 1 000
 */

const REF: ReferencePeriod = { year: 2026, month: 6 };

const charges: CockpitCharge[] = [
  {
    id: 'loyer',
    label: 'Loyer',
    amount: new Decimal(505),
    frequency: 'monthly',
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    paymentDay: 5,
    isActive: true,
  },
  {
    id: 'assurance',
    label: 'Assurance',
    amount: new Decimal(1800),
    frequency: 'annual',
    paymentMonths: [11],
    paymentDay: 15,
    isActive: true,
  },
];

function situation(
  movements: OperationDuJournal[],
  revenuEcrit: Decimal | null = new Decimal(2000),
) {
  return calculerSituationDuMois({
    revenus: revenuEcrit,
    charges,
    soldeEpargneActuel: new Decimal(0),
    payments: new Map(),
    ref: REF,
    engagementsMensuels: new Decimal(100),
    depensesDuMois: new Decimal(245),
    joursEcoules: 15,
    joursDuMois: 30,
    operations: operationsDuMois(movements, REF),
  });
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function versProvisions(
  amount: string,
  provisionPart: string,
  over: Partial<OperationDuJournal> = {},
): OperationDuJournal {
  const total = new Decimal(amount);
  return {
    kind: 'transfer',
    fromAccountType: 'income_bills',
    toAccountType: 'provisions',
    amount: total,
    occurredOn: day('2026-06-03'),
    cancelledAt: null,
    planYear: 2026,
    planMonth: 6,
    freeSavingsPart: total.minus(provisionPart),
    incomeNature: null,
    ...over,
  };
}

function virement(
  from: OperationDuJournal['fromAccountType'],
  to: OperationDuJournal['toAccountType'],
  amount: string,
): OperationDuJournal {
  return {
    kind: 'transfer',
    fromAccountType: from,
    toAccountType: to,
    amount: new Decimal(amount),
    occurredOn: day('2026-06-03'),
    cancelledAt: null,
    planYear: 2026,
    planMonth: 6,
    freeSavingsPart: null,
    incomeNature: null,
  };
}

function argentRecu(
  nature: 'regular' | 'extra',
  amount: string,
  over: Partial<OperationDuJournal> = {},
): OperationDuJournal {
  return {
    kind: 'income',
    fromAccountType: null,
    toAccountType: 'income_bills',
    amount: new Decimal(amount),
    occurredOn: day('2026-06-12'),
    cancelledAt: null,
    planYear: null,
    planMonth: null,
    freeSavingsPart: null,
    incomeNature: nature,
    ...over,
  };
}

const eur = (d: Decimal) => d.toFixed(2);
const ANNULE = { cancelledAt: new Date('2026-06-14T10:00:00Z') };

describe('« Il te reste » — the truth table (PR D, option B)', () => {
  it('no operation: 2 000 − 505 − 150 − 100 − 245 = 1 000', () => {
    const s = situation([]);
    expect(eur(s.ilTeReste)).toBe('1000.00');
    expect(eur(s.misDeCote)).toBe('0.00');
    expect(eur(s.retenu)).toBe('755.00');
  });

  it('a transfer entirely into provisions takes nothing: they are already in the smoothed effort', () => {
    const s = situation([versProvisions('705', '705')]);
    expect(eur(s.ilTeReste)).toBe('1000.00');
    expect(eur(s.misDeCote)).toBe('0.00');
  });

  it('a transfer with a free part takes exactly that free part', () => {
    const s = situation([versProvisions('905', '705')]);
    expect(eur(s.misDeCote)).toBe('200.00');
    expect(eur(s.ilTeReste)).toBe('800.00');
    // The budget of the month is the figure BEFORE spending: it moves too.
    expect(eur(s.resteDisponible)).toBe('1045.00');
  });

  it('a cancelled transfer takes nothing', () => {
    const s = situation([versProvisions('905', '705', ANNULE)]);
    expect(eur(s.ilTeReste)).toBe('1000.00');
  });

  it('a reopened transfer (cancelled_at back to null) takes its free part again', () => {
    const annule = versProvisions('905', '705', ANNULE);
    expect(eur(situation([annule]).ilTeReste)).toBe('1000.00');
    const rouvert = { ...annule, cancelledAt: null };
    expect(eur(situation([rouvert]).ilTeReste)).toBe('800.00');
  });

  it('money received « on top of the income » (extra) adds to the income', () => {
    const s = situation([argentRecu('extra', '120')]);
    expect(eur(s.recuEnPlus)).toBe('120.00');
    expect(eur(s.revenus)).toBe('2120.00');
    expect(eur(s.ilTeReste)).toBe('1120.00');
  });

  it('a cancelled extra adds nothing', () => {
    const s = situation([argentRecu('extra', '120', ANNULE)]);
    expect(eur(s.ilTeReste)).toBe('1000.00');
  });

  it('a regular income equal to the written income is its arrival: nothing is added', () => {
    const s = situation([argentRecu('regular', '2000')]);
    expect(eur(s.revenus)).toBe('2000.00');
    expect(eur(s.ilTeReste)).toBe('1000.00');
  });

  it('a regular income different from the written one REPLACES it (as the mock-up does), and says so', () => {
    const s = situation([argentRecu('regular', '1900')]);
    expect(eur(s.revenus)).toBe('1900.00');
    expect(eur(s.ilTeReste)).toBe('900.00');
    expect(s.revenuRecu && eur(s.revenuRecu)).toBe('1900.00');
    expect(s.revenuEcrit && eur(s.revenuEcrit)).toBe('2000.00');
  });

  it('an income received in TWO parts: the figure drops after the first, and comes back after the second', () => {
    // Open screen decision for the pilot (issue): a beginner sees the figure
    // FALL while writing money received. It is the mock-up's behaviour.
    const premier = argentRecu('regular', '1200');
    expect(eur(situation([premier]).ilTeReste)).toBe('200.00');
    const second = argentRecu('regular', '800', { occurredOn: day('2026-06-20') });
    expect(eur(situation([premier, second]).ilTeReste)).toBe('1000.00');
  });

  it('a partial first salary turns the status RED until the rest arrives (mock-up rule, open decision)', () => {
    // 100 received as « Mon revenu du mois » replaces the written 2 000: the
    // obligations (755) exceed it. Pinned so the choice stays visible.
    expect(situation([argentRecu('regular', '100')]).statut).toBe('rouge');
    expect(situation([argentRecu('regular', '2000')]).statut).not.toBe('rouge');
  });

  it('an operation of another plan month does not count', () => {
    const planDeMai = versProvisions('905', '705', { planMonth: 5, occurredOn: day('2026-06-02') });
    expect(eur(situation([planDeMai]).ilTeReste)).toBe('1000.00');
    // Without a plan month, the date decides: 31 May is not June.
    const libreDeMai = versProvisions('905', '705', {
      planYear: null,
      planMonth: null,
      occurredOn: day('2026-05-31'),
    });
    expect(eur(situation([libreDeMai]).ilTeReste)).toBe('1000.00');
    const extraDeMai = argentRecu('extra', '120', { occurredOn: day('2026-05-31') });
    expect(eur(situation([extraDeMai]).ilTeReste)).toBe('1000.00');
  });

  it('a free transfer to provisions, without a plan month, counts in the month of its date', () => {
    const libre = versProvisions('905', '705', { planYear: null, planMonth: null });
    expect(eur(situation([libre]).ilTeReste)).toBe('800.00');
  });

  it('a transfer to the daily account or back from provisions takes nothing from the figure', () => {
    const s = situation([
      virement('income_bills', 'daily_card', '600'),
      virement('provisions', 'income_bills', '280'),
    ]);
    expect(eur(s.ilTeReste)).toBe('1000.00');
  });

  it('transfers beyond what the income left: a negative figure, and the neutral sentence amount', () => {
    // budget before putting aside = 2 000 − 755 = 1 245.
    // Out of the main account: 1 100 to the daily account + the FREE part 1 300
    // of the provisions transfer (its provisions part is already retained).
    const s = situation([
      virement('income_bills', 'daily_card', '1100'),
      versProvisions('2005', '705'),
    ]);
    expect(eur(s.misDeCote)).toBe('1300.00');
    expect(eur(s.ilTeReste)).toBe('-300.00');
    expect(eur(s.budgetAvantMiseDeCote)).toBe('1245.00');
    expect(eur(s.auDelaDuRevenu)).toBe('1155.00');
    // Obligations still fit in the income: this is not « red ».
    expect(s.statut).toBe('orange');
  });

  it('no neutral sentence while the transfers stay within the budget', () => {
    const s = situation([
      virement('income_bills', 'daily_card', '600'),
      versProvisions('905', '705'),
    ]);
    expect(eur(s.auDelaDuRevenu)).toBe('0.00');
  });

  it('cents: three free parts of 33.33 take exactly 99.99', () => {
    const s = situation([
      versProvisions('33.33', '0'),
      versProvisions('33.33', '0', { occurredOn: day('2026-06-10') }),
      versProvisions('33.33', '0', { occurredOn: day('2026-06-20') }),
    ]);
    expect(s.misDeCote.equals(new Decimal('99.99'))).toBe(true);
    expect(s.ilTeReste.equals(new Decimal('900.01'))).toBe(true);
  });

  it('extra alone, with no written income and no regular income: the mock-up computes on it', () => {
    const s = situation([argentRecu('extra', '120')], null);
    expect(s.statut).not.toBe('incomplet');
    expect(eur(s.revenus)).toBe('120.00');
  });

  it('no written income and no money received: still incomplete', () => {
    expect(situation([], null).statut).toBe('incomplet');
  });

  it('AUCUNE_OPERATION is what an empty journal yields', () => {
    const vide = operationsDuMois([], REF);
    expect(vide.revenuRecu).toBeNull();
    expect(eur(vide.recuEnPlus)).toBe(eur(AUCUNE_OPERATION.recuEnPlus));
    expect(eur(vide.misDeCote)).toBe(eur(AUCUNE_OPERATION.misDeCote));
    expect(eur(vide.sortiesDuPrincipal)).toBe(eur(AUCUNE_OPERATION.sortiesDuPrincipal));
  });
});
