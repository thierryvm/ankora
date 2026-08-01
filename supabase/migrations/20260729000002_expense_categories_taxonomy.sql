-- =========================================================================
-- Chantier 2 — the expense taxonomy of ADR-022, additive only
-- =========================================================================
-- ⚠️  WRITTEN, NOT APPLIED. The linked Supabase project is PRODUCTION and there
--     is no staging environment. This file is for @thierry to read and run.
--
-- WHY THIS EXISTS
-- ---------------
-- `categories` has been seeded with 8 rows at every signup since 2026-05-03:
-- Logement, Famille, Taxes, Santé, Abonnements, Assurances, Transport, Autres.
-- That is a taxonomy of RECURRING BILLS. Five of them are `kind = 'variable'`
-- and therefore offerable in the expense picker (ADR-035 §5 excludes `fixed`
-- ones, which would double-count against the smoothed provisions) — but the
-- five are Logement / Famille / Santé / Transport / Autres.
--
-- None of them is « Courses ». For a household recording day-to-day spending,
-- the single most frequent expense category does not exist. The picker works
-- without this migration; it just cannot name the thing the user is buying.
--
-- ADR-022 (Accepted, 26 July 2026) settled the target taxonomy: 18 categories
-- across 5 groups, the 8 existing ones kept verbatim because production rows
-- reference them and a rename would break history. This migration is the
-- data half of that decision, and nothing more.
--
-- WHAT IS DELIBERATELY NOT HERE
-- -----------------------------
--   * `icon` (ADR-022 §4) — the picker renders a colour dot and a name; an
--     unused column is speculation.
--   * `category_rules` + the Belgian-retailer dictionary (ADR-022 §3) — that
--     is assisted categorisation, a layer of its own, and ADR-022 itself says
--     shipping it alongside the taxonomy asks the user to learn two systems at
--     once.
--   * user-defined categories — explicitly deferred by ADR-022.
--
-- SAFETY
-- ------
--   * No DROP, no ALTER of an existing column's type, no rename. Purely
--     additive: one nullable-by-default column and ten INSERTs guarded by
--     NOT EXISTS on (workspace_id, name).
--   * Idempotent: running it twice changes nothing.
--   * Column is named `category_group`, NOT `group` — the latter is a reserved
--     word and would need quoting at every call site, which is how a typo
--     becomes a production outage. Deviation from the ADR's wording, on purpose.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. The grouping axis (ADR-022 décision 1: two levels for READING, one for
--    ENTRY). The group is a column of the category, never a selection step —
--    a two-level picker would double the cost of every expense recorded, and
--    entry friction is the documented cause of death of manual-entry apps.
-- -------------------------------------------------------------------------
alter table public.categories
  add column if not exists category_group text
    check (category_group in ('vie_courante', 'logement', 'obligations', 'famille', 'divers'));

comment on column public.categories.category_group is
  'Reading/aggregation axis (ADR-022). NEVER a selection step at entry, and never an input to any monetary calculation. Named category_group because "group" is a reserved word.';

-- -------------------------------------------------------------------------
-- 2. Backfill the 8 existing categories with their group.
--    Matched on `name` because that is what the 2026-05-03 seed inserted and
--    ADR-022 keeps those names verbatim. Rows a user has since renamed simply
--    keep a null group — harmless, and better than guessing.
-- -------------------------------------------------------------------------
update public.categories set category_group = 'logement'    where name = 'Logement'    and category_group is null;
update public.categories set category_group = 'famille'     where name = 'Famille'     and category_group is null;
update public.categories set category_group = 'obligations' where name = 'Taxes'       and category_group is null;
update public.categories set category_group = 'obligations' where name = 'Santé'       and category_group is null;
update public.categories set category_group = 'divers'      where name = 'Abonnements' and category_group is null;
update public.categories set category_group = 'obligations' where name = 'Assurances'  and category_group is null;
update public.categories set category_group = 'vie_courante' where name = 'Transport'  and category_group is null;
update public.categories set category_group = 'divers'      where name = 'Autres'      and category_group is null;

-- -------------------------------------------------------------------------
-- 3. seed_expense_categories(workspace_id, owner_id)
--
--    A SECOND function rather than a rewrite of `seed_default_categories`:
--    that one early-returns as soon as ANY category exists for the workspace,
--    so extending it would seed nothing for the workspaces that already have
--    the original 8 — i.e. for every existing user. Two functions, two jobs.
--
--    SECURITY DEFINER for the same reason as its neighbour: it runs from
--    `handle_new_user` before the user has a session, and must bypass the
--    `categories_editor_write` policy that requires `created_by = auth.uid()`.
--    `search_path` is pinned, as everywhere else in this schema.
-- -------------------------------------------------------------------------
create or replace function public.seed_expense_categories(ws_id uuid, owner_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Guarded per-row on (workspace_id, name): a user who already created their
  -- own « Courses » keeps it, and re-running inserts nothing.
  insert into public.categories
    (workspace_id, created_by, name, color_token, kind, is_system, category_group)
  select ws_id, owner_id, v.name, v.color_token, v.kind, false, v.category_group
  from (values
    -- Vie courante — the five that make daily entry possible at all.
    ('Courses',               'emerald', 'variable', 'vie_courante'),
    ('Restaurant & café',     'amber',   'variable', 'vie_courante'),
    -- Carburant is its own line, not folded into Transport: for a motorised
    -- Belgian household it is a heavy recurring figure that deserves to be
    -- read on its own (ADR-022). Transport keeps public transport, servicing,
    -- parking.
    ('Carburant',             'cyan',    'variable', 'vie_courante'),
    ('Shopping & vêtements',  'pink',    'variable', 'vie_courante'),
    ('Loisirs & sorties',     'purple',  'variable', 'vie_courante'),
    -- Logement
    ('Énergie',               'rose',    'variable', 'logement'),
    ('Internet & télécom',    'blue',    'variable', 'logement'),
    -- Obligations. `kind = 'fixed'`: this one is a BILL category, so ADR-035
    -- keeps it out of the expense picker. It exists so a charge can be filed
    -- under it, not so an expense can.
    ('Crédits',               'zinc',    'fixed',    'obligations'),
    -- Famille
    ('Animaux',               'amber',   'variable', 'famille'),
    -- Divers
    ('Cadeaux',               'pink',    'variable', 'divers')
  ) as v(name, color_token, kind, category_group)
  where not exists (
    select 1 from public.categories c
    where c.workspace_id = ws_id and c.name = v.name
  );
end $$;

revoke execute on function public.seed_expense_categories(uuid, uuid) from public;

comment on function public.seed_expense_categories(uuid, uuid) is
  'Seeds the 10 expense categories of ADR-022 that the 2026-05-03 bill taxonomy lacked. Idempotent per (workspace_id, name) — safe to re-run, and preserves a category the user created themselves under the same name.';

-- -------------------------------------------------------------------------
-- 4. New signups get all 18. Re-created in full: PostgreSQL has no way to
--    append to a function body.
-- -------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_workspace_id uuid;
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));

  insert into public.workspaces (owner_id, name)
  values (new.id, 'Mon espace')
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  insert into public.workspace_settings (workspace_id) values (new_workspace_id);

  perform public.seed_default_accounts(new_workspace_id);
  perform public.seed_default_categories(new_workspace_id, new.id);
  perform public.seed_expense_categories(new_workspace_id, new.id);

  return new;
end $$;

-- -------------------------------------------------------------------------
-- 5. Backfill every existing workspace.
-- -------------------------------------------------------------------------
do $$
declare
  ws record;
begin
  for ws in select id, owner_id from public.workspaces loop
    perform public.seed_expense_categories(ws.id, ws.owner_id);
  end loop;
end $$;
