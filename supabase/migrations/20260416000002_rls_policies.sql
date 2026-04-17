-- Ankora — Row Level Security policies
-- Principle: a user can only access rows tied to workspaces they are a member of.
-- Audit log is service-role only (never exposed via PostgREST).

alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.categories enable row level security;
alter table public.charges enable row level security;
alter table public.expenses enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.user_consents enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.audit_log enable row level security;

-- =========================================================================
-- USERS: user can read/update only their own profile
-- =========================================================================
create policy "users_self_select" on public.users
  for select using (auth.uid() = id);
create policy "users_self_update" on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- =========================================================================
-- WORKSPACE_MEMBERS: member can see own rows only
-- =========================================================================
create policy "members_self_select" on public.workspace_members
  for select using (auth.uid() = user_id);

-- Helper: is the caller a member of the given workspace?
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_editor(ws_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid() and role in ('owner','editor')
  );
$$;

-- =========================================================================
-- WORKSPACES
-- =========================================================================
create policy "workspaces_member_select" on public.workspaces
  for select using (public.is_workspace_member(id));
create policy "workspaces_owner_update" on public.workspaces
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "workspaces_owner_insert" on public.workspaces
  for insert with check (auth.uid() = owner_id);
create policy "workspaces_owner_delete" on public.workspaces
  for delete using (auth.uid() = owner_id);

-- =========================================================================
-- CATEGORIES / CHARGES / EXPENSES: workspace-scoped
-- =========================================================================
create policy "categories_member_select" on public.categories
  for select using (public.is_workspace_member(workspace_id));
create policy "categories_editor_write" on public.categories
  for all using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id) and created_by = auth.uid());

create policy "charges_member_select" on public.charges
  for select using (public.is_workspace_member(workspace_id));
create policy "charges_editor_write" on public.charges
  for all using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id) and created_by = auth.uid());

create policy "expenses_member_select" on public.expenses
  for select using (public.is_workspace_member(workspace_id));
create policy "expenses_editor_write" on public.expenses
  for all using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id) and created_by = auth.uid());

-- =========================================================================
-- WORKSPACE SETTINGS
-- =========================================================================
create policy "settings_member_select" on public.workspace_settings
  for select using (public.is_workspace_member(workspace_id));
create policy "settings_editor_update" on public.workspace_settings
  for update using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));

-- =========================================================================
-- GDPR: consents / deletion_requests — self only
-- =========================================================================
create policy "consents_self_select" on public.user_consents
  for select using (auth.uid() = user_id);
create policy "consents_self_upsert" on public.user_consents
  for insert with check (auth.uid() = user_id);
create policy "consents_self_update" on public.user_consents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "deletion_self_select" on public.deletion_requests
  for select using (auth.uid() = user_id);
create policy "deletion_self_insert" on public.deletion_requests
  for insert with check (auth.uid() = user_id);
create policy "deletion_self_update" on public.deletion_requests
  for update using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id);

-- =========================================================================
-- AUDIT LOG: no PostgREST access (service role only via admin client)
-- =========================================================================
revoke all on public.audit_log from anon, authenticated;
-- No policies granted → no rows readable/writable from client JWTs.

-- Lock down extension + internal functions
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.touch_updated_at() from public;
