-- =========================================================================
-- Security hardening — function grants + search_path pinning
-- =========================================================================
-- Closes Supabase advisors 0011 (exposed SECURITY DEFINER) and 0029
-- (function_search_path_mutable). Strict revoke-only — no functional
-- changes to RLS or signup flow.
--
-- Verifications applied 2026-05-28 (cf. docs/prs/PR-security-hardening-report.md):
--   - grep .rpc(...) on src/ → 0 client call-sites for any of the 7 functions
--   - handle_new_user is a trigger function (returns trigger) on auth.users,
--     no RPC fallback in code
--   - is_workspace_member/editor invoked by RLS policies in `authenticated`
--     role — MUST stay executable for authenticated (see P2 below)
--   - touch_updated_at body trivial (new.updated_at = now(); return new) —
--     no catalog lookup, safe with empty search_path
--
-- Audit_log "permission denied" bug (smoke #191) is deferred to follow-up PR
-- `chore(security): fix audit_log service_role client (H3)` — out of scope
-- here to keep this PR strictly SQL grants + advisors fix.
-- =========================================================================

-- ------------------------------------------------------------------------
-- P1: privileged trigger / maintenance / seed functions
-- ------------------------------------------------------------------------
-- Wrapped in DO/IF EXISTS to survive drift (rls_auto_enable is reported by
-- the Supabase advisor but absent from versioned migrations — likely created
-- out-of-band in the SQL Editor before migration tracking; guard avoids
-- migration failure).
--
-- Important: seed_default_accounts / seed_default_categories are called via
-- PERFORM from inside handle_new_user (SECURITY DEFINER). PERFORM executes
-- in the owner context (postgres), so REVOKE EXECUTE FROM anon/authenticated
-- has NO effect on the signup path — purely defense-in-depth against
-- unintended RPC misuse.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'purge_audit_log_older_than_12_months') then
    revoke execute on function public.purge_audit_log_older_than_12_months() from anon, authenticated, public;
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'handle_new_user') then
    revoke execute on function public.handle_new_user() from anon, authenticated, public;
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'seed_default_accounts') then
    revoke execute on function public.seed_default_accounts(uuid) from anon, authenticated, public;
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'seed_default_categories') then
    revoke execute on function public.seed_default_categories(uuid, uuid) from anon, authenticated, public;
  end if;
end $$;

-- ------------------------------------------------------------------------
-- P2: RLS helpers — anon only
-- ------------------------------------------------------------------------
-- Why anon-only: invoked by RLS policies running as `authenticated`
-- (rls_policies.sql:51,63,65,69,71,75,77 — workspaces/categories/charges/
-- expenses workspace-scoped). Revoking from `authenticated` would 403
-- every workspace-scoped query for legitimate users.
revoke execute on function public.is_workspace_member(uuid) from anon;
revoke execute on function public.is_workspace_editor(uuid) from anon;

-- ------------------------------------------------------------------------
-- P3: pin search_path on touch_updated_at
-- ------------------------------------------------------------------------
-- Eliminates advisor 0029 (function_search_path_mutable). Body uses only
-- the `new` PL/pgSQL builtin, no catalog reference — empty search_path
-- is safe and recommended.
alter function public.touch_updated_at() set search_path = '';

-- ------------------------------------------------------------------------
-- Documentation pinned for future maintainers
-- ------------------------------------------------------------------------
comment on function public.is_workspace_member(uuid) is
  'Workspace membership probe (SECURITY DEFINER). Invoked by RLS policies in the authenticated role — MUST NOT be revoked from authenticated.';
comment on function public.is_workspace_editor(uuid) is
  'Workspace editor probe (SECURITY DEFINER). Invoked by RLS policies in the authenticated role — MUST NOT be revoked from authenticated.';
