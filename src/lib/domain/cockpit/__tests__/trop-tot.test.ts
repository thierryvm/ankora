import { describe, expect, it } from 'vitest';

import {
  DEPENSES_MIN_PROJECTION,
  JOURS_DONNEES_MIN_PROJECTION,
  epargneAffichee,
  joursDeDonnees,
  tropTotPourProjeter,
} from '../trop-tot';

describe('joursDeDonnees', () => {
  it('counts today when the first operation is today', () => {
    expect(joursDeDonnees('2026-09-12', '2026-09-12')).toBe(1);
  });

  it('counts across a month boundary, from the first operation, today included', () => {
    expect(joursDeDonnees('2026-08-29', '2026-09-02')).toBe(5);
  });

  it('falls back to today when no operation exists yet', () => {
    expect(joursDeDonnees(null, '2026-09-12')).toBe(1);
  });

  it('never goes below one day for a first operation dated in the future', () => {
    expect(joursDeDonnees('2026-09-20', '2026-09-12')).toBe(1);
  });
});

describe('tropTotPourProjeter (G-31)', () => {
  it('uses the thresholds of the mockup: 7 days of data, 5 expenses', () => {
    expect(JOURS_DONNEES_MIN_PROJECTION).toBe(7);
    expect(DEPENSES_MIN_PROJECTION).toBe(5);
  });

  it('is too early under 7 days of data AND under 5 expenses', () => {
    expect(
      tropTotPourProjeter({
        premiereOperation: '2026-09-08',
        aujourdhui: '2026-09-13',
        nbDepenses: 4,
      }),
    ).toBe(true);
  });

  it('is no longer too early on the 7th day of data, whatever the count', () => {
    expect(
      tropTotPourProjeter({
        premiereOperation: '2026-09-07',
        aujourdhui: '2026-09-13',
        nbDepenses: 1,
      }),
    ).toBe(false);
  });

  it('is no longer too early at the 5th expense, whatever the days', () => {
    expect(
      tropTotPourProjeter({
        premiereOperation: '2026-09-12',
        aujourdhui: '2026-09-13',
        nbDepenses: 5,
      }),
    ).toBe(false);
  });

  it('counts days from the FIRST operation, not from the first of the month', () => {
    // A month that is only 3 days old, on a workspace with weeks of history.
    expect(
      tropTotPourProjeter({
        premiereOperation: '2026-07-01',
        aujourdhui: '2026-09-03',
        nbDepenses: 0,
      }),
    ).toBe(false);
  });

  it('is too early with no operation at all', () => {
    expect(
      tropTotPourProjeter({ premiereOperation: null, aujourdhui: '2026-09-13', nbDepenses: 0 }),
    ).toBe(true);
  });
});

describe('epargneAffichee — one truth for every card of the cockpit', () => {
  it('hides the savings figure while it is too early to project', () => {
    expect(epargneAffichee(487, true)).toBeNull();
  });

  it('shows the domain figure once a threshold is reached', () => {
    expect(epargneAffichee(168.67, false)).toBe(168.67);
  });

  it('keeps « no figure yet » as it is', () => {
    expect(epargneAffichee(null, false)).toBeNull();
  });
});
