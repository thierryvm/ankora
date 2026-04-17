-- =========================================================================
-- RLS hardening — defense in depth
-- =========================================================================
--
-- Goals:
--   1. Force RLS for table owners too (bypass via superuser becomes explicit).
--   2. Re-assert RLS ON on every user-scoped table (idempotent safety net).
--   3. Provide a CI-callable guardrail that flags any public table missing RLS.
--   4. Implement the 12-month audit_log retention promised in privacy policy
--      (GDPR art. 5(1)(e) — storage limitation).
-- =========================================================================

-- --- 1. Re-assert & FORCE RLS on every user-scoped public table --------
alter table public.users              enable row level security;
alter table public.users              force  row level security;
alter table public.workspaces         enable row level security;
alter table public.workspaces         force  row level security;
alter table public.workspace_members  enable row level security;
alter table public.workspace_members  force  row level security;
alter table public.categories         enable row level security;
alter table public.categories         force  row level security;
alter table public.charges            enable row level security;
alter table public.charges            force  row level security;
alter table public.expenses           enable row level security;
alter table public.expenses           force  row level security;
alter table public.workspace_settings enable row level security;
alter table public.workspace_settings force  row level security;
alter table public.user_consents      enable row level security;
alter table public.user_consents      force  row level security;
alter table public.deletion_requests  enable row level security;
alter table public.deletion_requests  force  row level security;
alter table public.audit_log          enable row level security;
alter table public.audit_log          force  row level security;

-- --- 2. Guardrail function — list any public table missing RLS --------
-- Callable from CI: `select * from public.assert_rls_coverage();`
-- Must return zero rows. If it returns any, the migration that created
-- the table forgot to enable RLS.
create or replace function public.assert_rls_coverage()
returns table(schema_name text, table_name text, rls_enabled boolean, rls_forced boolean)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select
    n.nspname::text as schema_name,
    c.relname::text as table_name,
    c.relrowsecurity  as rls_enabled,
    c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and (c.relrowsecurity is false or c.relforcerowsecurity is false);
$$;

comment on function public.assert_rls_coverage() is
  'Returns public tables that do NOT have RLS both enabled and forced. Must return zero rows in CI.';

revoke execute on function public.assert_rls_coverage() from public;
grant execute on function public.assert_rls_coverage() to service_role;

-- --- 3. Audit log retention — 12 months ------------------------------
-- GDPR art. 5(1)(e): retention limited to what's necessary.
-- Privacy policy commits to 12 months max for security logs.
create or replace function public.purge_audit_log_older_than_12_months()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  deleted_count integer;
begin
  delete from public.audit_log
  where occurred_at < (now() - interval '12 months');
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.purge_audit_log_older_than_12_months() is
  'Purges audit_log rows older than 12 months. Schedule via pg_cron or a Supabase cron Edge Function. Returns the number of rows deleted.';

revoke execute on function public.purge_audit_log_older_than_12_months() from public;
grant execute on function public.purge_audit_log_older_than_12_months() to service_role;
