-- =========================================================================
-- Migration: explicit deny policies on public.audit_log
-- Reason: Supabase linter flags RLS-enabled tables with zero policies.
--         audit_log is already locked (RLS on + grants revoked from anon/auth),
--         service_role bypasses RLS. Adding explicit USING(false) policies
--         makes the intent visible and silences the advisor.
-- =========================================================================

-- Defensive: recreate if the previous migration did not establish them
alter table public.audit_log enable row level security;
alter table public.audit_log force  row level security;

-- Drop any stale policies before recreating (idempotent)
drop policy if exists "audit_log_no_select" on public.audit_log;
drop policy if exists "audit_log_no_insert" on public.audit_log;
drop policy if exists "audit_log_no_update" on public.audit_log;
drop policy if exists "audit_log_no_delete" on public.audit_log;

-- Deny-all for every action. service_role bypasses RLS, so server-side
-- audit writes via createAdminClient() continue to work unchanged.
create policy "audit_log_no_select" on public.audit_log
  for select to anon, authenticated using (false);

create policy "audit_log_no_insert" on public.audit_log
  for insert to anon, authenticated with check (false);

create policy "audit_log_no_update" on public.audit_log
  for update to anon, authenticated using (false) with check (false);

create policy "audit_log_no_delete" on public.audit_log
  for delete to anon, authenticated using (false);

comment on table public.audit_log is
  'Append-only audit trail. Writes performed server-side via service_role (bypasses RLS). Client JWTs have no read/write access by policy and by grants.';
