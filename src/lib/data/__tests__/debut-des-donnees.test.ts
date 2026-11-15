import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  The session client, recorded call by call: the test proves the read is
  scoped to the workspace it is given, bounded to today and capped — RLS is the
  second wall, not the first.
*/
const query = {
  calls: [] as [string, unknown[]][],
  result: {
    data: [] as { occurred_on: string }[] | null,
    error: null as { message: string } | null,
  },
};
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const builder = {
      select: (...a: unknown[]) => (query.calls.push(['select', a]), builder),
      eq: (...a: unknown[]) => (query.calls.push(['eq', a]), builder),
      lte: (...a: unknown[]) => (query.calls.push(['lte', a]), builder),
      order: (...a: unknown[]) => (query.calls.push(['order', a]), builder),
      limit: async (...a: unknown[]) => (query.calls.push(['limit', a]), query.result),
    };
    return { from: (t: string) => (query.calls.push(['from', [t]]), builder) };
  },
}));

import {
  combineDebutDesDonnees,
  debutDesDonneesPourLaCarte,
  readDebutDesDonnees,
  readDepensesDebut,
} from '@/lib/data/debut-des-donnees';
import { DataReadUnavailableError } from '@/lib/data/read-failure';

beforeEach(() => {
  query.calls = [];
  query.result = { data: [], error: null };
});

describe('readDebutDesDonnees', () => {
  it('reads the expenses of the given workspace only, up to today, five at most', async () => {
    await readDebutDesDonnees('ws-1', '2026-09-12', null);
    expect(query.calls).toEqual([
      ['from', ['expenses']],
      ['select', ['occurred_on']],
      ['eq', ['workspace_id', 'ws-1']],
      ['lte', ['occurred_on', '2026-09-12']],
      ['order', ['occurred_on', { ascending: true }]],
      ['limit', [5]],
    ]);
  });

  it('takes the older of the first expense and the first movement', async () => {
    query.result = {
      data: [{ occurred_on: '2026-09-03' }, { occurred_on: '2026-09-05' }],
      error: null,
    };
    await expect(readDebutDesDonnees('ws-1', '2026-09-12', '2026-08-30')).resolves.toEqual({
      premiereOperation: '2026-08-30',
      nbDepenses: 2,
    });
  });

  it('says « no operation » when there is none on either side', async () => {
    await expect(readDebutDesDonnees('ws-1', '2026-09-12', null)).resolves.toEqual({
      premiereOperation: null,
      nbDepenses: 0,
    });
  });

  it('throws on a failed read rather than claiming it is too early', async () => {
    query.result = { data: null, error: { message: 'boom' } };
    await expect(readDebutDesDonnees('ws-1', '2026-09-12', null)).rejects.toThrow();
  });
});

describe('readDepensesDebut', () => {
  it('returns the expense days only, oldest first, as read', async () => {
    query.result = {
      data: [{ occurred_on: '2026-09-03' }, { occurred_on: '2026-09-05T00:00:00' }],
      error: null,
    };
    await expect(readDepensesDebut('ws-1', '2026-09-12')).resolves.toEqual([
      '2026-09-03',
      '2026-09-05',
    ]);
  });

  it('throws a DataReadUnavailableError on a failed read', async () => {
    query.result = { data: null, error: { message: 'boom' } };
    await expect(readDepensesDebut('ws-1', '2026-09-12')).rejects.toBeInstanceOf(
      DataReadUnavailableError,
    );
  });
});

describe('combineDebutDesDonnees', () => {
  it('nothing on either side', () => {
    expect(combineDebutDesDonnees([], null)).toEqual({ premiereOperation: null, nbDepenses: 0 });
  });

  it('a movement older than every expense wins', () => {
    expect(combineDebutDesDonnees(['2026-09-03'], '2026-08-30')).toEqual({
      premiereOperation: '2026-08-30',
      nbDepenses: 1,
    });
  });

  it('an expense older than the first movement wins', () => {
    expect(combineDebutDesDonnees(['2026-08-01', '2026-09-03'], '2026-08-30')).toEqual({
      premiereOperation: '2026-08-01',
      nbDepenses: 2,
    });
  });

  it('counts the capped read as it came: five at most', () => {
    const cinq = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'];
    expect(combineDebutDesDonnees(cinq, null)).toEqual({
      premiereOperation: '2026-08-01',
      nbDepenses: 5,
    });
  });
});

describe('debutDesDonneesPourLaCarte — the early read, judged once the situation is known', () => {
  const failure = new DataReadUnavailableError('debut-des-donnees.expenses', { message: 'boom' });
  const reread = vi.fn(async () => ({ premiereOperation: '2026-09-01', nbDepenses: 3 }));
  const base = {
    todayIso: '2026-09-12',
    todayAtStart: '2026-09-12',
    premierMouvement: '2026-08-30',
    reread,
  };

  beforeEach(() => reread.mockClear());

  it('not needed: null, no reread', async () => {
    await expect(
      debutDesDonneesPourLaCarte({
        ...base,
        needed: false,
        early: { ok: true, dates: ['2026-09-03'] },
      }),
    ).resolves.toBeNull();
    expect(reread).not.toHaveBeenCalled();
  });

  it('not needed and the early read failed: still null, never thrown', async () => {
    await expect(
      debutDesDonneesPourLaCarte({ ...base, needed: false, early: { ok: false, error: failure } }),
    ).resolves.toBeNull();
    expect(reread).not.toHaveBeenCalled();
  });

  it('needed and the early read failed: the same DataReadUnavailableError is thrown', async () => {
    await expect(
      debutDesDonneesPourLaCarte({ ...base, needed: true, early: { ok: false, error: failure } }),
    ).rejects.toBe(failure);
    expect(reread).not.toHaveBeenCalled();
  });

  it('needed: the early dates combined with the first movement', async () => {
    await expect(
      debutDesDonneesPourLaCarte({
        ...base,
        needed: true,
        early: { ok: true, dates: ['2026-09-03', '2026-09-05'] },
      }),
    ).resolves.toEqual({ premiereOperation: '2026-08-30', nbDepenses: 2 });
    expect(reread).not.toHaveBeenCalled();
  });

  it('midnight crossed: read again for the situation day, ignoring the early answer', async () => {
    await expect(
      debutDesDonneesPourLaCarte({
        ...base,
        todayIso: '2026-09-13',
        needed: true,
        early: { ok: true, dates: ['2026-09-03'] },
      }),
    ).resolves.toEqual({ premiereOperation: '2026-09-01', nbDepenses: 3 });
    expect(reread).toHaveBeenCalledTimes(1);
  });

  it('midnight crossed and the early read failed: read again, nothing thrown', async () => {
    await expect(
      debutDesDonneesPourLaCarte({
        ...base,
        todayIso: '2026-09-13',
        needed: true,
        early: { ok: false, error: failure },
      }),
    ).resolves.toEqual({ premiereOperation: '2026-09-01', nbDepenses: 3 });
    expect(reread).toHaveBeenCalledTimes(1);
  });
});
