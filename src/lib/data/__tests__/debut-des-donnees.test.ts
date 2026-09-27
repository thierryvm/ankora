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

import { readDebutDesDonnees } from '@/lib/data/debut-des-donnees';

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
