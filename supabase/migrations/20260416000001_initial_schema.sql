-- Ankora — Initial schema (Phase 1: isolated single-user workspaces)
-- RGPD: every table carries an owner path traceable to auth.users.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =========================================================================
-- USERS (profile mirror of auth.users)
-- =========================================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  locale text not null default 'fr-BE',
  timezone text not null default 'Europe/Brussels',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================================
-- WORKSPACES (ready for Phase 2 shared pots, single-user in Phase 1)
-- =========================================================================
create table public.workspaces (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  currency text not null default 'EUR' check (currency in ('EUR','USD','GBP','CHF')),
  monthly_income numeric(14,2),
  fiscal_month_start smallint not null default 1 check (fiscal_month_start between 1 and 28),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces(owner_id);

-- Workspace membership (pre-wired for Phase 2 — always just the owner in Phase 1)
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- =========================================================================
-- CATEGORIES
-- =========================================================================
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text,
  kind text not null check (kind in ('fixed','variable','income')),
  created_at timestamptz not null default now()
);
create index categories_workspace_idx on public.categories(workspace_id);

-- =========================================================================
-- CHARGES (fixed / recurring bills)
-- =========================================================================
create table public.charges (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  amount numeric(12,2) not null check (amount >= 0),
  frequency text not null check (frequency in ('monthly','quarterly','semiannual','annual')),
  due_month smallint not null check (due_month between 1 and 12),
  category_id uuid references public.categories(id) on delete set null,
  is_active boolean not null default true,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index charges_workspace_idx on public.charges(workspace_id);
create index charges_active_idx on public.charges(workspace_id, is_active) where is_active = true;

-- =========================================================================
-- EXPENSES (variable spending)
-- =========================================================================
create table public.expenses (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  amount numeric(12,2) not null check (amount >= 0),
  occurred_on date not null,
  category_id uuid references public.categories(id) on delete set null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index expenses_workspace_date_idx on public.expenses(workspace_id, occurred_on desc);

-- =========================================================================
-- WORKSPACE SETTINGS (extensible key-value)
-- =========================================================================
create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  provision_target numeric(14,2),
  savings_balance numeric(14,2) default 0,
  months_tracked smallint default 1 check (months_tracked between 1 and 12),
  updated_at timestamptz not null default now()
);

-- =========================================================================
-- GDPR: CONSENTS
-- =========================================================================
create table public.user_consents (
  user_id uuid not null references public.users(id) on delete cascade,
  scope text not null check (scope in ('tos','privacy','cookies.analytics','cookies.marketing','newsletter')),
  granted boolean not null,
  version text not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text check (char_length(user_agent) <= 256),
  primary key (user_id, scope)
);
create index user_consents_scope_idx on public.user_consents(scope);

-- =========================================================================
-- GDPR: DELETION REQUESTS
-- =========================================================================
create table public.deletion_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','cancelled','completed')),
  reason text check (char_length(reason) <= 500),
  cancelled_at timestamptz,
  completed_at timestamptz
);
create index deletion_requests_status_idx on public.deletion_requests(status, scheduled_for);

-- =========================================================================
-- AUDIT LOG (append-only, service-role writes only)
-- =========================================================================
create table public.audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  event_type text not null,
  user_id uuid references public.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  ip_address inet,
  user_agent text check (char_length(user_agent) <= 256),
  metadata jsonb not null default '{}'::jsonb
);
create index audit_log_user_idx on public.audit_log(user_id, occurred_at desc);
create index audit_log_event_idx on public.audit_log(event_type, occurred_at desc);

-- =========================================================================
-- TRIGGERS: updated_at + user bootstrap
-- =========================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();
create trigger workspaces_touch before update on public.workspaces
  for each row execute function public.touch_updated_at();
create trigger charges_touch before update on public.charges
  for each row execute function public.touch_updated_at();
create trigger workspace_settings_touch before update on public.workspace_settings
  for each row execute function public.touch_updated_at();

-- Auto-create public.users + default workspace when auth.users row is inserted
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

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
