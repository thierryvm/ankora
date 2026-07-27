import { beforeEach, describe, expect, it } from 'vitest';

import {
  claimPendingDeletionsWith,
  executeDeletionWith,
  pseudonymiseAuditLog,
  type DeletionClient,
} from '../deletion-core';

/**
 * The three behaviours below are counter-intuitive on purpose, and each one is
 * a failure mode ADR-024 measured rather than guessed:
 *
 *   - pseudonymising ZERO rows is a SUCCESS (an account may legitimately have
 *     no audit events; requiring `count > 0` would freeze the queue for exactly
 *     those accounts);
 *   - a GoTrue "user not found" is a SUCCESS (otherwise the row is a poison
 *     pill, claimed and failed every day forever);
 *   - a pseudonymisation ERROR must stop the deletion (the account must not be
 *     destroyed while rows still carry its user_id, ip and user agent — after
 *     the auth user is gone, `on delete set null` makes them unfindable).
 *
 * No mock of `@/lib/supabase/admin` here, deliberately: this module takes its
 * client as a parameter, which is what makes the destructive path importable
 * from a Playwright spec (ADR-024 D5).
 */

const USER_ID = '11111111-2222-3333-4444-555555555555';

type Scripted = {
  update?: { error: { message: string } | null; count?: number | null };
  deleteUser?: { error: { message: string; status?: number } | null };
  rpc?: { data: unknown; error: { message: string } | null };
};

const calls: string[] = [];
let updateOptions: unknown;
let updateValues: unknown;
let eqFilter: { column: string; value: unknown } | undefined;

function makeClient(scripted: Scripted): DeletionClient {
  const updateChain = {
    eq: (column: string, value: unknown) => {
      eqFilter = { column, value };
      return updateChain;
    },
    then: (onFulfilled?: (r: unknown) => unknown) =>
      Promise.resolve(scripted.update ?? { error: null, count: 0 }).then(onFulfilled),
  };

  const client = {
    from: (table: string) => ({
      update: (values: unknown, options?: unknown) => {
        calls.push(`update:${table}`);
        updateValues = values;
        updateOptions = options;
        return updateChain;
      },
    }),
    auth: {
      admin: {
        deleteUser: async () => {
          calls.push('auth.deleteUser');
          return scripted.deleteUser ?? { error: null };
        },
      },
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push(`rpc:${fn}:${JSON.stringify(args)}`);
      return scripted.rpc ?? { data: [], error: null };
    },
  };
  return client as unknown as DeletionClient;
}

beforeEach(() => {
  calls.length = 0;
  updateOptions = undefined;
  updateValues = undefined;
  eqFilter = undefined;
});

describe('pseudonymiseAuditLog', () => {
  it('returns the row count and asks PostgREST for an exact one', async () => {
    const client = makeClient({ update: { error: null, count: 4 } });

    await expect(pseudonymiseAuditLog(client, USER_ID)).resolves.toBe(4);

    // Without `count: 'exact'` PostgREST returns null, and the report could
    // never state how many rows an erasure actually touched.
    expect(updateOptions).toEqual({ count: 'exact' });
    expect(eqFilter).toEqual({ column: 'user_id', value: USER_ID });
  });

  it('clears the IP and the user agent, not just the user id', async () => {
    const client = makeClient({ update: { error: null, count: 1 } });

    await pseudonymiseAuditLog(client, USER_ID);

    // `user_id` alone would be worthless: `on delete set null` clears it as a
    // side effect of the cascade. The IP and the user agent are cleared by
    // NOTHING else — dropping either from this payload would leave personal
    // data behind while every other assertion stayed green. Until now that
    // regression was caught only by the real-Supabase job, not by the unit
    // suite that runs on every push.
    expect(updateValues).toEqual({ user_id: null, ip_address: null, user_agent: null });
  });

  it('treats zero rows as a success, not as a reason to stop', async () => {
    const client = makeClient({ update: { error: null, count: 0 } });

    await expect(pseudonymiseAuditLog(client, USER_ID)).resolves.toBe(0);
  });

  it('throws on a refusal', async () => {
    const client = makeClient({
      update: { error: { message: 'permission denied for table audit_log' } },
    });

    await expect(pseudonymiseAuditLog(client, USER_ID)).rejects.toThrow(/pseudonymise audit log/i);
  });
});

describe('executeDeletionWith', () => {
  it('does not delete the account when pseudonymisation is refused', async () => {
    const client = makeClient({ update: { error: { message: 'permission denied' } } });

    await expect(executeDeletionWith(client, USER_ID)).rejects.toThrow(/pseudonymise audit log/i);
    expect(calls).toEqual(['update:audit_log']);
  });

  it('DOES delete the account when pseudonymisation touched zero rows', async () => {
    const client = makeClient({ update: { error: null, count: 0 } });

    await expect(executeDeletionWith(client, USER_ID)).resolves.toEqual({ pseudonymisedRows: 0 });
    expect(calls).toEqual(['update:audit_log', 'auth.deleteUser']);
  });

  it('counts a 404 from GoTrue as a success', async () => {
    const client = makeClient({
      update: { error: null, count: 2 },
      deleteUser: { error: { message: 'User not found', status: 404 } },
    });

    await expect(executeDeletionWith(client, USER_ID)).resolves.toEqual({ pseudonymisedRows: 2 });
  });

  it('counts a "user not found" message as a success even without a status', async () => {
    const client = makeClient({
      update: { error: null, count: 0 },
      deleteUser: { error: { message: 'user not found' } },
    });

    await expect(executeDeletionWith(client, USER_ID)).resolves.toEqual({ pseudonymisedRows: 0 });
  });

  it('propagates any other GoTrue failure, so the row is retried', async () => {
    const client = makeClient({
      update: { error: null, count: 1 },
      deleteUser: { error: { message: 'service unavailable', status: 503 } },
    });

    await expect(executeDeletionWith(client, USER_ID)).rejects.toThrow(/delete auth user/i);
  });

  it('never issues a workspace delete — the cascade from public.users covers it', async () => {
    const client = makeClient({ update: { error: null, count: 1 } });

    await executeDeletionWith(client, USER_ID);

    expect(calls).not.toContain('delete:workspaces');
  });
});

describe('claimPendingDeletionsWith', () => {
  it('passes the batch size through and maps the SQL row shape', async () => {
    const client = makeClient({
      rpc: {
        data: [
          { request_id: 'req-1', target_user_id: USER_ID },
          { request_id: 'req-2', target_user_id: '22222222-3333-4444-5555-666666666666' },
        ],
        error: null,
      },
    });

    await expect(claimPendingDeletionsWith(client, 25)).resolves.toEqual([
      { requestId: 'req-1', userId: USER_ID },
      { requestId: 'req-2', userId: '22222222-3333-4444-5555-666666666666' },
    ]);
    expect(calls).toEqual(['rpc:claim_pending_deletions:{"batch_size":25}']);
  });

  it('returns an empty list when nothing is due', async () => {
    const client = makeClient({ rpc: { data: null, error: null } });

    await expect(claimPendingDeletionsWith(client, 25)).resolves.toEqual([]);
  });

  it('throws when the claim itself fails, so the run does not report a quiet zero', async () => {
    const client = makeClient({
      rpc: { data: null, error: { message: 'function does not exist' } },
    });

    await expect(claimPendingDeletionsWith(client, 25)).rejects.toThrow(/claim pending deletions/i);
  });
});

// Guards the extraction itself: if someone re-adds `import 'server-only'` (or
// an import that drags it in) this module stops being importable from
// Playwright, and the destructive path silently goes back to being untested
// end-to-end. Vitest aliases `server-only` away, so this cannot be caught by
// importing — the module graph has to be inspected.
describe('module boundary (ADR-024 D5)', () => {
  it('pulls in nothing that carries the server-only marker', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    // From cwd rather than `import.meta.url`: under Vitest the latter is not a
    // `file:` URL, and the suite runs from the repository root.
    const source = await readFile(join(process.cwd(), 'src/lib/gdpr/deletion-core.ts'), 'utf8');

    // RUNTIME imports only. `import type` is erased at compile time, and the
    // doc block deliberately names all three of these modules — matching the
    // whole file would fail on its own explanation.
    const runtimeImports = source
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line) && !/^\s*import\s+type\b/.test(line))
      .join('\n');

    expect(runtimeImports).not.toMatch(/server-only/);
    // `@/lib/security/audit-log` re-exports from `@/lib/supabase/admin`, so even
    // `import { AuditEvent }` — a value, not a type — would drag the marker back
    // in and make this module unimportable from Playwright.
    expect(runtimeImports).not.toMatch(/@\/lib\/supabase\/admin/);
    expect(runtimeImports).not.toMatch(/@\/lib\/security\/audit-log/);
    expect(runtimeImports).not.toMatch(/@\/lib\/env/);
  });
});
