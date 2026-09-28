import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { AUCUNE_OPERATION } from '@/lib/domain/cockpit/operations-du-mois';
import { calculerSituationDuMois, revenuDeBase } from '@/lib/domain/cockpit/situation-mois';
import type { PaymentLedger } from '@/lib/domain/cockpit/types';

// Tour 56, decision of @thierry (28 Sept. 2026) — on a FINISHED month the base
// income is the money received, and the word says so. The month running now
// and the months ahead keep issue #483 (the greater of written and received).
// Seen in production: a finished month showed the received amount under
// « Revenu prévu » once the written income had been raised afterwards.
// Fictitious amounts only (famille 505 / 705).

const situation = (over: {
  revenus: number | null;
  revenuRecu: number | null;
  moisTermine: boolean;
}) =>
  calculerSituationDuMois({
    revenus: over.revenus === null ? null : new Decimal(over.revenus),
    charges: [],
    soldeEpargneActuel: new Decimal(0),
    payments: new Map() as unknown as PaymentLedger,
    ref: { year: 2026, month: 9 },
    engagementsMensuels: new Decimal(0),
    depensesDuMois: new Decimal(0),
    operations: {
      ...AUCUNE_OPERATION,
      revenuRecu: over.revenuRecu === null ? null : new Decimal(over.revenuRecu),
    },
    joursEcoules: 30,
    joursDuMois: 30,
    moisTermine: over.moisTermine,
  });

describe('revenuDeBase — one rule for the amount AND its word', () => {
  it('finished month, received < written: the amount is the money received, called received', () => {
    const r = revenuDeBase({
      revenuEcrit: new Decimal(705),
      revenuRecu: new Decimal(505),
      moisTermine: true,
    });
    expect(r.montant?.toNumber()).toBe(505);
    expect(r.terme).toBe('recu');

    const s = situation({ revenus: 705, revenuRecu: 505, moisTermine: true });
    expect(s.revenus.toNumber()).toBe(505);
    expect(s.termeRevenu).toBe('recu');
  });

  it('finished month, received > written: the money received, called received', () => {
    const s = situation({ revenus: 505, revenuRecu: 705, moisTermine: true });
    expect(s.revenus.toNumber()).toBe(705);
    expect(s.termeRevenu).toBe('recu');
  });

  it('finished month with nothing received: the written income, and the word says nothing was noted', () => {
    const s = situation({ revenus: 705, revenuRecu: null, moisTermine: true });
    expect(s.revenus.toNumber()).toBe(705);
    expect(s.termeRevenu).toBe('rienNote');
  });

  it('running month, received < written: #483 unchanged — the written income, called planned', () => {
    const s = situation({ revenus: 705, revenuRecu: 505, moisTermine: false });
    expect(s.revenus.toNumber()).toBe(705);
    expect(s.termeRevenu).toBe('prevu');
  });

  it('running month, received > written: the money received, called received', () => {
    const s = situation({ revenus: 505, revenuRecu: 705, moisTermine: false });
    expect(s.revenus.toNumber()).toBe(705);
    expect(s.termeRevenu).toBe('recu');
  });

  it('running month, nothing received yet: the written income, called planned', () => {
    const s = situation({ revenus: 705, revenuRecu: null, moisTermine: false });
    expect(s.revenus.toNumber()).toBe(705);
    expect(s.termeRevenu).toBe('prevu');
  });

  it('no written income: the money received, called received, whatever the month', () => {
    for (const moisTermine of [true, false]) {
      const s = situation({ revenus: null, revenuRecu: 505, moisTermine });
      expect(s.revenus.toNumber()).toBe(505);
      expect(s.termeRevenu).toBe('recu');
    }
  });
});
