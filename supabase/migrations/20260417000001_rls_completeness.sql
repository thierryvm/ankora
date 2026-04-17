-- Ankora — RLS completeness (Phase 2)
-- Closes 3 findings from rls-flow-tester agent:
--   1. workspace_settings: missing INSERT policy
--   2. workspace_members: missing self-manage policies
--   3. users: missing INSERT policy (matches handle_new_user trigger expectation)

-- =========================================================================
-- USERS — allow self-insert (defense in depth; trigger still runs as SECURITY DEFINER)
-- =========================================================================
create policy "users_self_insert" on public.users
  for insert with check (auth.uid() = id);

-- =========================================================================
-- WORKSPACE_MEMBERS — owner may insert/delete member rows for their workspace
-- (Phase 1 keeps this to the owner only; Phase 2 pots will widen.)
-- =========================================================================
create policy "members_owner_insert" on public.workspace_members
  for insert
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

create policy "members_owner_delete" on public.workspace_members
  for delete
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

-- =========================================================================
-- WORKSPACE_SETTINGS — editor may insert row if missing (safe upsert)
-- =========================================================================
create policy "settings_editor_insert" on public.workspace_settings
  for insert
  with check (public.is_workspace_editor(workspace_id));
