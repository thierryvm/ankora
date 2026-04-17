-- =========================================================================
-- Migration: IronBudget 3-account model
-- =========================================================================
-- Each workspace owns exactly 3 named accounts that mirror the real-world
-- bank architecture described in the product spec:
--
--   principal     — receives salary, pays fixed monthly bills
--   vie_courante  — daily spending pot (fixed transfer from principal)
--   epargne       — provisioning buffer for quarterly/annual bills
--
-- Charges with frequency='monthly' are debited from principal; periodic
-- charges are debited from epargne (provisioning). Expenses default to
-- vie_courante but can be reassigned.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Accounts table — composite PK (workspace_id, kind) enforces exactly
--    one row per kind per workspace.
-- -------------------------------------------------------------------------
create table public.accounts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('principal','vie_courante','epargne')),
  label text not null check (char_length(label) between 1 and 60),
  balance numeric(14,2) not null default 0 check (balance >= -1e12 and balance <= 1e12),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, kind)
);

create index accounts_workspace_idx on public.accounts(workspace_id);

alter table public.accounts enable row level security;
alter table public.accounts force  row level security;

create trigger accounts_touch before update on public.accounts
  for each row execute function public.touch_updated_at();

-- RLS: member reads, editor updates (mirrors workspace_settings policy).
-- No INSERT policy — seeding happens via handle_new_user() trigger only.
-- No DELETE policy — the three accounts are invariants of the workspace.
create policy "accounts_member_select" on public.accounts
  for select using (public.is_workspace_member(workspace_id));

create policy "accounts_editor_update" on public.accounts
  for update using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));

-- -------------------------------------------------------------------------
-- 2. Workspaces: fixed monthly transfer from principal → vie_courante.
--    Null = user hasn't set an allowance yet (onboarding-friendly).
-- -------------------------------------------------------------------------
alter table public.workspaces
  add column vie_courante_monthly_transfer numeric(14,2)
    check (vie_courante_monthly_transfer is null
           or (vie_courante_monthly_transfer >= 0
               and vie_courante_monthly_transfer <= 1e8));

-- -------------------------------------------------------------------------
-- 3. Expenses: which account was debited.
--    Default 'vie_courante' matches IronBudget's daily-spending model.
-- -------------------------------------------------------------------------
alter table public.expenses
  add column paid_from text not null default 'vie_courante'
    check (paid_from in ('principal','vie_courante','epargne'));

create index expenses_paid_from_idx on public.expenses(workspace_id, paid_from);

-- -------------------------------------------------------------------------
-- 4. Charges: which account pays (auto-derivable from frequency but made
--    explicit so the user can override — e.g. an annual bill auto-debited
--    from principal instead of epargne).
-- -------------------------------------------------------------------------
alter table public.charges
  add column paid_from text not null default 'principal'
    check (paid_from in ('principal','epargne'));

-- -------------------------------------------------------------------------
-- 5. Seeding helper — inserts the 3 default accounts for a workspace.
-- -------------------------------------------------------------------------
create or replace function public.seed_default_accounts(ws_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.accounts (workspace_id, kind, label)
  values
    (ws_id, 'principal',    'Compte Principal'),
    (ws_id, 'vie_courante', 'Vie Courante'),
    (ws_id, 'epargne',      'Épargne & Provisions')
  on conflict (workspace_id, kind) do nothing;
$$;

revoke execute on function public.seed_default_accounts(uuid) from public;

-- -------------------------------------------------------------------------
-- 6. handle_new_user: also seed the 3 accounts on signup.
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

  return new;
end $$;

-- -------------------------------------------------------------------------
-- 7. Backfill existing workspaces (idempotent via ON CONFLICT).
-- -------------------------------------------------------------------------
do $$
declare
  ws record;
begin
  for ws in select id from public.workspaces loop
    perform public.seed_default_accounts(ws.id);
  end loop;
end $$;
