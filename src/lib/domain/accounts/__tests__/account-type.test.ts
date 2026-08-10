import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_KINDS,
  ACCOUNT_TYPES,
  accountKindFromType,
  accountTypeFromKind,
} from '@/lib/domain/accounts/account-type';
import type { AccountType } from '@/lib/domain/cockpit/types';
import type { AccountKind } from '@/lib/domain/types';

// IMPORTÉES, pas recopiées. Une liste écrite à la main ici resterait à trois
// entrées le jour où un quatrième compte apparaît d'un seul côté : le test
// continuerait de tourner sur les trois anciennes, cohérentes entre elles, et
// annoncerait vert. Relevé par `test-quality-auditor` le 2026-08-10.
const KINDS = ACCOUNT_KINDS;
const TYPES = ACCOUNT_TYPES;

describe('accountTypeFromKind / accountKindFromType', () => {
  it.each([
    ['principal', 'income_bills'],
    ['vie_courante', 'daily_card'],
    ['epargne', 'provisions'],
  ] as const)('maps %s to %s', (kind, type) => {
    expect(accountTypeFromKind(kind)).toBe(type);
    expect(accountKindFromType(type)).toBe(kind);
  });

  it('round-trips every kind', () => {
    for (const kind of KINDS) {
      expect(accountKindFromType(accountTypeFromKind(kind))).toBe(kind);
    }
  });

  it('round-trips every type', () => {
    for (const type of TYPES) {
      expect(accountTypeFromKind(accountKindFromType(type))).toBe(type);
    }
  });

  // The mapping is what the SQL backfill of 20260810000001 does, so the two
  // must agree. `epargne → provisions` is the pair that actually decides
  // something: it is the only non-default value `charges.paid_from` can hold.
  it('agrees with the migration on the pair that is not the default', () => {
    expect(accountTypeFromKind('epargne')).toBe('provisions');
  });

  // A silent fallback here would ship a wrong attribution into a column D6
  // (J4) derives balances from — two balances wrong, total still right.
  it.each(['', 'income_bills', 'PRINCIPAL', 'compte_imaginaire'])(
    'refuses %o as a kind',
    (bogus) => {
      expect(() => accountTypeFromKind(bogus as AccountKind)).toThrow(/Unknown account kind/);
    },
  );

  it.each(['', 'principal', 'INCOME_BILLS', 'compte_imaginaire'])(
    'refuses %o as a type',
    (bogus) => {
      expect(() => accountKindFromType(bogus as AccountType)).toThrow(/Unknown account type/);
    },
  );

  // Attrape un quatrième compte ajouté d'UN SEUL côté : les deux listes étant
  // dérivées des tables elles-mêmes, elles divergeraient en longueur ici, alors
  // que les valeurs connues continueraient de s'aller-retourner sans broncher.
  it('couvre exactement le même ensemble dans les deux sens', () => {
    expect(KINDS).toHaveLength(3);
    expect(TYPES).toHaveLength(3);
    expect(KINDS.map(accountTypeFromKind).sort()).toEqual([...TYPES].sort());
    expect(TYPES.map(accountKindFromType).sort()).toEqual([...KINDS].sort());
  });
});
