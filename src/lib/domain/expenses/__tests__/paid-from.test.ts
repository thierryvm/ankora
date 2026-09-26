import { describe, expect, it } from 'vitest';

import { ownDescriptionsFrom, type OwnDescription } from '@/lib/domain/expense-descriptions';
import { defaultExpenseAccount, recallPaidFrom } from '@/lib/domain/expenses/paid-from';

function own(label: string, paidFrom: OwnDescription['paidFrom']): OwnDescription {
  return { label, categoryId: null, count: 1, lastOn: '2026-09-01', paidFrom };
}

describe('defaultExpenseAccount — the account an expense is paid from when nothing says otherwise', () => {
  it('is « Vie courante » when no expense has been written yet', () => {
    expect(defaultExpenseAccount([])).toBe('vie_courante');
  });

  it('is the account most expenses were paid from', () => {
    expect(
      defaultExpenseAccount([
        { paidFrom: 'vie_courante' },
        { paidFrom: 'principal' },
        { paidFrom: 'principal' },
      ]),
    ).toBe('principal');
  });

  it('breaks a tie on the most recent expense, rows being read newest first', () => {
    expect(
      defaultExpenseAccount([
        { paidFrom: 'principal' },
        { paidFrom: 'vie_courante' },
        { paidFrom: 'vie_courante' },
        { paidFrom: 'principal' },
      ]),
    ).toBe('principal');
  });
});

describe('recallPaidFrom — the account of the last expense with the same description', () => {
  const descriptions = [own('Loyer garage', 'principal'), own('Delhaize', 'vie_courante')];

  it('recalls it on a description typed in full, case and accents aside', () => {
    expect(recallPaidFrom('loyer GARAGE', descriptions)).toBe('principal');
  });

  it('recalls nothing for a description never written', () => {
    expect(recallPaidFrom('Cinéma', descriptions)).toBeNull();
  });

  it('recalls nothing when the description carries no account', () => {
    expect(recallPaidFrom('Pharmacie', [own('Pharmacie', undefined)])).toBeNull();
  });
});

describe('ownDescriptionsFrom — the account follows the most recent expense', () => {
  it('keeps the account of the latest expense under one description', () => {
    const [description] = ownDescriptionsFrom(
      [
        {
          label: 'Loyer garage',
          categoryId: null,
          occurredOn: '2026-08-01',
          createdAt: '2026-08-01T08:00:00Z',
          paidFrom: 'vie_courante',
        },
        {
          label: 'Loyer garage',
          categoryId: null,
          occurredOn: '2026-09-01',
          createdAt: '2026-09-01T08:00:00Z',
          paidFrom: 'principal',
        },
      ],
      { categoryNames: [], fallbackLabels: [] },
    );
    expect(description?.paidFrom).toBe('principal');
  });
});
