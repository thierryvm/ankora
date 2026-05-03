-- =========================================================================
-- PR-D1 (Voie D Foundations) — Migration 3/4
-- categories: color_token + is_system + seed 8 default categories
-- =========================================================================
-- Cf. spec `dashboard-cockpit-vraie-vision-2026-05-03.md` §"Data models cibles".
--
-- The existing `categories` table (initial schema) already carries `name`,
-- `color` (#hex) and `kind` ('fixed' | 'variable' | 'income'). We enrich it
-- additively (per @cowork validation 2026-05-03) without renaming columns:
--   * color_token  — Tailwind palette token (drives badge color in the UI)
--   * is_system    — protected categories that cannot be deleted (e.g. "Autres")
--
-- The 8 default categories are seeded automatically at workspace creation
-- via handle_new_user(). They are language-neutral by default (FR labels);
-- the UI can override visually via color_token.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. New columns
-- -------------------------------------------------------------------------
alter table public.categories
  add column if not exists color_token text not null default 'zinc'
    check (color_token in ('blue', 'pink', 'rose', 'emerald', 'purple', 'amber', 'cyan', 'zinc')),
  add column if not exists is_system boolean not null default false;

-- -------------------------------------------------------------------------
-- 2. seed_default_categories(workspace_id, owner_id)
--    SECURITY DEFINER so handle_new_user can call it during signup
--    before the user has a session, and so it bypasses the
--    `categories_editor_write` RLS policy that requires
--    `created_by = auth.uid()`.
-- -------------------------------------------------------------------------
create or replace function public.seed_default_categories(ws_id uuid, owner_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Idempotent: if any category exists for this workspace, do nothing.
  -- Mostly relevant for the backfill block at the end of this migration.
  if exists (select 1 from public.categories where workspace_id = ws_id) then
    return;
  end if;

  insert into public.categories
    (workspace_id, created_by, name, color_token, kind, is_system)
  values
    (ws_id, owner_id, 'Logement',     'blue',    'variable', false),
    (ws_id, owner_id, 'Famille',      'pink',    'variable', false),
    (ws_id, owner_id, 'Taxes',        'rose',    'fixed',    false),
    (ws_id, owner_id, 'Santé',        'emerald', 'variable', false),
    (ws_id, owner_id, 'Abonnements',  'purple',  'fixed',    false),
    (ws_id, owner_id, 'Assurances',   'amber',   'fixed',    false),
    (ws_id, owner_id, 'Transport',    'cyan',    'variable', false),
    (ws_id, owner_id, 'Autres',       'zinc',    'variable', true);
end $$;

revoke execute on function public.seed_default_categories(uuid, uuid) from public;

-- -------------------------------------------------------------------------
-- 3. handle_new_user: also seed the 8 default categories at signup.
--    Re-create the trigger function entirely (PostgreSQL doesn't support
--    appending to a function body).
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

  return new;
end $$;

-- -------------------------------------------------------------------------
-- 4. Backfill existing workspaces (idempotent — guarded by the early-return
--    inside seed_default_categories).
-- -------------------------------------------------------------------------
do $$
declare
  ws record;
begin
  for ws in select id, owner_id from public.workspaces loop
    perform public.seed_default_categories(ws.id, ws.owner_id);
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- 5. Documentation
-- -------------------------------------------------------------------------
comment on column public.categories.color_token is
  'Tailwind palette token (blue/pink/rose/emerald/purple/amber/cyan/zinc). Drives the badge color in the cockpit charge list.';
comment on column public.categories.is_system is
  'Protected category that cannot be deleted by the user (e.g. "Autres"). Enforced application-side; UI hides the delete button.';
comment on function public.seed_default_categories(uuid, uuid) is
  'Inserts the 8 default categories at workspace creation. Idempotent: no-op if any category already exists for the workspace.';
