import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  analyserMigration,
  analyserStatuts,
  attenteNonCouverte,
  comparerListeMigrations,
  objetsCrees,
} from '../migrations-additives.mjs';

type Refus = { regle: string; extrait: string };

const regles = (sql: string, existants: Iterable<string> = []): string[] =>
  (analyserMigration(sql, { objetsExistants: new Set(existants) }) as Refus[]).map((r) => r.regle);

describe('analyserMigration — what is refused', () => {
  it.each([
    ['drop table', 'drop table public.expenses;'],
    ['drop column', 'alter table public.expenses drop column note;'],
    ['drop constraint', 'alter table public.expenses drop constraint expenses_amount_check;'],
    ['drop policy on an existing table', 'drop policy "p" on public.expenses;'],
    ['drop function', 'drop function public.is_workspace_member(uuid);'],
    ['drop type', 'drop type public.cadence;'],
    ['drop default', 'alter table public.expenses alter column note drop default;'],
  ])('refuses %s', (_label, sql) => {
    expect(regles(sql)).toContain('drop');
  });

  it('refuses truncate', () => {
    expect(regles('truncate public.expenses;')).toContain('truncate');
  });

  it('refuses delete from', () => {
    expect(regles('delete from public.expenses where amount < 0;')).toContain('delete');
  });

  it('refuses update … set on data, with or without only/alias', () => {
    expect(regles("update public.expenses set note = 'x';")).toContain('update');
    expect(regles("update only public.expenses e set note = 'x';")).toContain('update');
    expect(regles("update public.expenses as e set note = 'x';")).toContain('update');
  });

  it('refuses on conflict do update set (rewrites existing rows)', () => {
    expect(
      regles(
        "insert into public.t (id, v) values (1, 'a') on conflict (id) do update set v = excluded.v;",
      ),
    ).toContain('update');
  });

  it('refuses alter column … type, with or without set data', () => {
    expect(regles('alter table public.t alter column amount type numeric(14,2);')).toContain(
      'type',
    );
    expect(regles('alter table public.t alter column amount set data type text;')).toContain(
      'type',
    );
    expect(regles('alter table public.t alter amount type text;')).toContain('type');
  });

  it('refuses rename (table, column, constraint)', () => {
    expect(regles('alter table public.t rename to u;')).toContain('rename');
    expect(regles('alter table public.t rename column a to b;')).toContain('rename');
  });

  it('refuses set not null on an existing column', () => {
    expect(regles('alter table public.expenses alter column note set not null;')).toContain(
      'set-not-null',
    );
  });

  it('refuses revoke on an existing table', () => {
    expect(regles('revoke all on public.expenses from authenticated;')).toContain('revoke');
    expect(regles('revoke select on table public.expenses from anon;')).toContain('revoke');
  });

  it('refuses alter policy', () => {
    expect(regles('alter policy "p" on public.expenses using (true);')).toContain('alter-policy');
  });

  it('refuses disabling or un-forcing row level security', () => {
    expect(regles('alter table public.t disable row level security;')).toContain('rls');
    expect(regles('alter table public.t no force row level security;')).toContain('rls');
  });

  it('refuses grant to anon or to public, but not a grant on the public schema', () => {
    expect(regles('grant select on public.t to anon;')).toContain('grant');
    expect(regles('grant select on public.t to "anon";')).toContain('grant');
    expect(regles('grant execute on function public.f() to authenticated, public;')).toContain(
      'grant',
    );
    expect(regles('grant select on public.t to authenticated;')).not.toContain('grant');
  });

  it('refuses alter default privileges', () => {
    expect(
      regles('alter default privileges in schema public grant select on tables to authenticated;'),
    ).toContain('default-privileges');
  });

  it('refuses create or replace of a function, view or trigger that already exists', () => {
    const existants = ['public.is_workspace_member', 'public.v_month', 'public.trg_touch'];
    expect(
      regles(
        'create or replace function public.is_workspace_member(ws uuid) returns boolean language sql as $$ select true $$;',
        existants,
      ),
    ).toContain('create-or-replace');
    expect(regles('create or replace view v_month as select 1;', existants)).toContain(
      'create-or-replace',
    );
    expect(
      regles(
        'create or replace trigger trg_touch before insert on public.t for each row execute function f();',
        existants,
      ),
    ).toContain('create-or-replace');
  });

  it('refuses a destructive statement hidden in a do block or in dynamic SQL', () => {
    expect(regles('do $$ begin drop table public.t; end $$;')).toContain('drop');
    expect(regles("do $body$ begin execute 'drop table public.t'; end $body$;")).toContain('drop');
  });
});

describe('analyserMigration — what is accepted', () => {
  it('ignores destructive words inside -- and nested /* */ comments', () => {
    const sql = [
      '-- drop table public.expenses; delete from x; update t set a = 1;',
      '/* truncate x; /* nested: rename */ still comment: alter policy p */',
      'create table if not exists public.t (id uuid primary key);',
    ].join('\n');
    expect(regles(sql)).toEqual([]);
  });

  it('does not read a comment marker inside a string as a comment', () => {
    expect(regles("comment on table public.t is 'a -- b'; drop table public.t;")).toContain('drop');
  });

  it('counts a destructive word inside a string literal (fail-closed, documented)', () => {
    expect(regles("comment on table public.t is 'never drop this';")).toContain('drop');
  });

  it('accepts drop policy if exists + create policy when the table is created in the same file', () => {
    const sql = `
      create table public.n (id uuid primary key);
      drop policy if exists "n_select" on public.n;
      create policy "n_select" on public.n for select using (true);
      drop trigger if exists n_touch on public.n;
    `;
    expect(regles(sql)).toEqual([]);
  });

  it('refuses the same drop policy if exists on a table it did not create', () => {
    expect(
      regles(
        'drop policy if exists "p" on public.expenses; create policy "p" on public.expenses for select using (true);',
      ),
    ).toContain('drop');
  });

  it('accepts set not null and revoke on what the same file creates', () => {
    const sql = `
      create table public.n (id uuid primary key);
      alter table public.expenses add column if not exists note_v2 text;
      alter table public.expenses alter column note_v2 set not null;
      alter table public.n alter column id set not null;
      revoke all on public.n from anon;
    `;
    expect(regles(sql)).toEqual([]);
  });

  it('accepts create or replace of a function created for the first time', () => {
    expect(
      regles(
        'create or replace function public.neuve() returns int language sql as $$ select 1 $$;',
        ['public.autre'],
      ),
    ).toEqual([]);
  });

  it('does not confuse FK actions, policy commands or grants with data writes', () => {
    const sql = `
      create table public.n (
        id uuid primary key,
        ws uuid references public.workspaces(id) on delete cascade on update set null,
        dropped_at timestamptz
      );
      create policy "n_upd" on public.n for update using (true);
      grant select, insert, update, delete on public.n to authenticated;
      create trigger n_t before update on public.n for each row execute function public.touch();
    `;
    expect(regles(sql)).toEqual([]);
  });

  it('accepts the real migration 20260929000001', () => {
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        '../../../supabase/migrations/20260929000001_releve_reponse_par_operation.sql',
      ),
      'utf8',
    );
    expect(regles(sql, ['public.is_workspace_member', 'public.is_workspace_editor'])).toEqual([]);
  });
});

describe('objetsCrees', () => {
  it('collects functions, views and triggers, schema-qualified by default', () => {
    const noms = objetsCrees(`
      create or replace function "public"."F1"(a int) returns int language sql as $$ select 1 $$;
      create view v2 as select 1;
      create trigger t3 before insert on public.x for each row execute function f();
    `) as Set<string>;
    expect([...noms].sort()).toEqual(['public.f1', 'public.t3', 'public.v2']);
  });
});

describe('analyserStatuts — migration files already in history', () => {
  it('refuses a modified, deleted or renamed migration and accepts an added one', () => {
    const refus = analyserStatuts(
      [
        'A\tsupabase/migrations/20260930000001_neuve.sql',
        'M\tsupabase/migrations/20260101000001_ancienne.sql',
        'D\tsupabase/migrations/20260101000002_ancienne.sql',
        'R100\tsupabase/migrations/20260101000003_a.sql\tsupabase/migrations/20260101000003_b.sql',
      ].join('\n'),
      '20260929000001',
    ) as Refus[];
    expect(refus.map((r) => r.regle)).toEqual(['modifiee', 'supprimee', 'renommee']);
  });

  it('refuses an added migration dated before the latest one already in history', () => {
    const refus = analyserStatuts(
      'A\tsupabase/migrations/20260101000009_tardive.sql',
      '20260929000001',
    ) as Refus[];
    expect(refus.map((r) => r.regle)).toEqual(['horodatage']);
  });
});

describe('attenteNonCouverte — db push applies EVERY pending migration, not only this push', () => {
  const liste = [
    '   20260101000001 | 20260101000001 | 2026-01-01 00:00:01',
    '   20260102000001 |                |',
    '   20260103000001 |                |',
  ].join('\n');

  it('passes when the pending migrations are exactly the ones this push adds', () => {
    expect(attenteNonCouverte(liste, ['20260102000001', '20260103000001'])).toEqual([]);
  });

  it('refuses a pending migration this push did not add (an earlier refused one)', () => {
    expect(attenteNonCouverte(liste, ['20260103000001'])).toEqual(['20260102000001']);
  });

  it('fails closed on an unreadable list', () => {
    expect(attenteNonCouverte('Connecting to remote database...', ['20260103000001'])).not.toEqual(
      [],
    );
  });
});

describe('comparerListeMigrations', () => {
  const sortie = (lignes: string[]) =>
    [
      '',
      '   Local          | Remote         | Time (UTC)',
      '  ----------------|----------------|---------------------',
      ...lignes,
    ].join('\n');

  it('passes when every local migration is on the remote, and nothing else', () => {
    const res = comparerListeMigrations(
      sortie([
        '   20260101000001 | 20260101000001 | 2026-01-01 00:00:01',
        '   20260102000001 | 20260102000001 | 2026-01-02 00:00:01',
      ]),
      ['20260101000001', '20260102000001'],
    );
    expect(res.ok).toBe(true);
  });

  it('fails when a local migration is missing remotely', () => {
    const res = comparerListeMigrations(
      sortie([
        '   20260101000001 | 20260101000001 | 2026-01-01 00:00:01',
        '   20260102000001 |                |',
      ]),
      ['20260101000001', '20260102000001'],
    );
    expect(res.ok).toBe(false);
  });

  it('fails when the remote has a migration that is not in the repository', () => {
    const res = comparerListeMigrations(
      sortie([
        '   20260101000001 | 20260101000001 | 2026-01-01 00:00:01',
        '                  | 20260103000001 | 2026-01-03 00:00:01',
      ]),
      ['20260101000001'],
    );
    expect(res.ok).toBe(false);
  });

  it('fails closed when the output cannot be read (format changed, empty)', () => {
    expect(comparerListeMigrations('Connecting to remote database...', ['20260101000001']).ok).toBe(
      false,
    );
  });

  it('reads the box-drawing separator too', () => {
    const res = comparerListeMigrations(
      '   20260101000001 │ 20260101000001 │ 2026-01-01 00:00:01',
      ['20260101000001'],
    );
    expect(res.ok).toBe(true);
  });
});
